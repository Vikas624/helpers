import tron from '@cobo/tron';
import tronweb from 'tronweb';
import fetch from 'node-fetch';
import {BigNumber} from 'bignumber.js';
import {
  ImportAddress,
  ImportAddressFromMnemonic,
  ImportAddressFromHDKey,
  GetBalance,
  SendTrx,
  SendTrc20,
  Wallet,
  Amount,
  Network,
} from '../types/crypto/tron';

const getPath = (index: number) => `m/49'/194'/0'/0/${index}`;

const getTronGridLink = ({network = 'mainnet'}): string => {
  const {TRONGRID_API_KEY} = process.env;
  const subdomain =
    network === 'shasta' ?
      'api.shasta' :
      network === 'mainnet' ?
      'api' :
      network;

  if (!TRONGRID_API_KEY) throw new Error('Please provide TRONGRID_API_KEY');
  return `https://${subdomain}.trongrid.io`;
};

const requestTronGrid = async ({
  network,
  url,
  method = 'get',
  body = null,
}) => {
  const {TRONGRID_API_KEY} = process.env;
  const baseUrl = getTronGridLink({network});
  const link = `${baseUrl}/${url}`;
  body = body ? JSON.stringify(body) : null;
  const response = await fetch(link, {
    method,
    body,
    headers: {
      'content-type': 'application/json',
      'TRON-PRO-API-KEY': TRONGRID_API_KEY,
    },
  });

  return response.json();
};

const getLatestBlock = async ({network = 'mainnet'}: Network) => {
  const {
    blockID: hash,
    block_header: {
      raw_data: {timestamp, number},
    },
  } = await requestTronGrid({
    url: 'wallet/getnowblock',
    network,
  });

  return {hash, timestamp, number};
};

const broadcastTransaction = async ({network = 'mainnet', transaction}) => {
  const {hex} = transaction;
  return requestTronGrid({
    url: 'wallet/broadcasthex',
    method: 'post',
    network,
    body: {transaction: hex},
  });
};

export const parseTrx = (trx: number) => {
  return (trx * Math.pow(10, 6)) | 0;
};

export const sunToTrx = (sun: number) => {
  const trx = new BigNumber(sun).div(new BigNumber(Math.pow(10, 6))).toFixed();
  return parseFloat(trx);
};

export const createTrxAddress = (): Wallet => {
  const mnemonic = tron.generateMnemonic();
  const wallet = tron.fromMnemonic(mnemonic).derivePath(getPath(0));
  return {
    address: wallet.getAddress(),
    privateKey: wallet.getTronPrivateKey().toString(),
  };
};

export const importTrxAddress = ({privateKey}: ImportAddress): Wallet => {
  const wallet = tron.fromTronPrivateKey(privateKey);
  return {
    address: wallet.getAddress(),
    privateKey: wallet.getTronPrivateKey().toString(),
  };
};

export const createTrxAddressFromMnemonic = ({
  mnemonic,
  index,
}: ImportAddressFromMnemonic): Wallet => {
  const wallet = tron.fromMnemonic(mnemonic).derivePath(getPath(index));
  return {
    address: wallet.getAddress(),
    privateKey: wallet.getTronPrivateKey().toString(),
  };
};

export const createTrxAddressFromHDKey = ({
  hdkey,
  index,
}: ImportAddressFromHDKey): Wallet => {
  const wallet = tron.fromExtendedKey(hdkey).derivePath(getPath(index));
  return {
    address: wallet.getAddress(),
    privateKey: wallet.getTronPrivateKey().toString(),
  };
};

export const getTrxBalance = async ({
  address,
  network = 'mainnet',
}: GetBalance): Promise<Amount> => {
  const {data}: any = await requestTronGrid({
    network,
    url: `v1/accounts/${address}`,
  });

  if (!data.length) return {sun: 0, trx: 0};

  const [{balance: sun}] = data;

  const trx = sunToTrx(sun);

  return {sun, trx};
};

export const getTRC20Balance = async ({
  address,
  contractAddress,
  decimals,
  network = 'mainnet',
}): Promise<Amount> => {
  const {data}: any = await requestTronGrid({
    network,
    url: `v1/accounts/${address}`,
  });

  if (!data.length) return {sun: 0, trx: 0};

  const [{trc20}] = data;

  if (!trc20.length) return {sun: 0, trx: 0};

  for (let index = 0; index < trc20.length; index++) {
    const token = trc20[index];
    const tokenContractAddress = Object.keys(token)[0];

    if (tokenContractAddress === contractAddress) {
      const sun: number = parseInt(token[tokenContractAddress]);
      let trx: any = new BigNumber(sun)
          .div(new BigNumber(Math.pow(10, 6)))
          .toFixed();
      trx = parseFloat(trx);
      return {sun, trx};
    }
  }
  return {sun: 0, trx: 0};
};

export const sendTrx = async ({
  privateKey,
  address: to,
  amount: trx,
  network = 'mainnet',
}: SendTrx) => {
  const wallet = tron.fromTronPrivateKey(privateKey);
  const address = wallet.getAddress();
  const amount = parseTrx(trx);
  const latestBlock = await getLatestBlock({network});

  const {sun: balance} = await getTrxBalance({
    address,
    network,
  });

  if (new BigNumber(amount).gte(new BigNumber(balance))) {
    throw new Error('Insufficient balance');
  }

  const transaction = wallet.generateTransaction(
      to,
      amount,
      'TRX',
      latestBlock,
  );

  return broadcastTransaction({network, transaction});
};

export const sendTRC20Token = async ({
  address: to,
  contractAddress,
  amount: trx,
  privateKey,
  decimals,
  network = 'mainnet',
}: SendTrc20) => {
  const wallet = tron.fromTronPrivateKey(privateKey);
  const address = wallet.getAddress();
  const amount = trx * Math.pow(10, decimals);
  const latestBlock = await getLatestBlock({network});

  const {sun: balance} = await getTRC20Balance({
    address,
    network,
    contractAddress,
    decimals,
  });

  if (new BigNumber(amount).gte(new BigNumber(balance))) {
    throw new Error('Insufficient balance');
  }

  const transaction = wallet.transferTRC20Token(
      contractAddress,
      to,
      amount,
      latestBlock,
  );

  return broadcastTransaction({network, transaction});
};

export const getTrxTransactions = async ({
  address,
  network = 'mainnet',
}: GetBalance): Promise<Array<any>> => {
  const url = `v1/accounts/${address}/transactions`;

  const {data, success, error} = await requestTronGrid({
    url,
    network,
  });

  if (!success) throw new Error(error);

  return data;
};

export const getTrc20Transactions = async ({
  address,
  network = 'mainnet',
}: GetBalance): Promise<Array<any>> => {
  const url = `v1/accounts/${address}/transactions/trc20`;

  const {data, success, error} = await requestTronGrid({
    url,
    network,
  });

  if (!success) throw new Error(error);

  return data;
};

export const toHex = (address: string) => {
  return tronweb.address.toHex(address);
};

export const drainTrx = async ({
  privateKey,
  address: to,
  network = 'mainnet',
}: SendTrx) => {
  const wallet = tron.fromTronPrivateKey(privateKey);
  const address = wallet.getAddress();
  const latestBlock = await getLatestBlock({network});

  const {sun} = await getTrxBalance({
    address,
    network,
  });

  const amount = new BigNumber(sun).minus(new BigNumber(Math.pow(10, 6)));

  const transaction = wallet.generateTransaction(
      to,
      amount,
      'TRX',
      latestBlock,
  );

  const trx = await broadcastTransaction({network, transaction});
  return {...trx, amount};
};

export const drainTRC20Token = async ({
  address: to,
  contractAddress,
  privateKey,
  decimals,
  network = 'mainnet',
  backer = null,
}: SendTrc20) => {
  const wallet = tron.fromTronPrivateKey(privateKey);
  const address = wallet.getAddress();
  const latestBlock = await getLatestBlock({network});

  const {sun: amount} = await getTRC20Balance({
    address,
    network,
    contractAddress,
    decimals,
  });

  if (backer) {
    const {address} = importTrxAddress({privateKey});

    await sendTrx({
      privateKey: backer,
      amount: 1,
      network,
      address,
    });
  }

  const transaction = wallet.transferTRC20Token(
      contractAddress,
      to,
      amount,
      latestBlock,
  );

  const trx = await broadcastTransaction({network, transaction});
  return {...trx, amount};
};
