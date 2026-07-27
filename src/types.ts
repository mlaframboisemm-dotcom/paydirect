/// <reference types="vite/client" />
export interface Coin {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  color: string;
  description: string;
  circulatingSupply: string;
  allTimeHigh: number;
  popularity: number;
  sparkline: number[]; // Last 24 hours trend
  history1D: number[];
  history1W: number[];
  history1M: number[];
  history1Y: number[];
}

export interface Holding {
  symbol: string;
  amount: number;
  avgBuyPrice: number;
}

export interface Transaction {
  id: string;
  type: 'BUY' | 'SELL' | 'CONVERT' | 'EARN' | 'SEND' | 'RECEIVE' | 'WISE_WITHDRAWAL' | 'WISE_DEPOSIT_RECEIVE';
  assetSymbol: string;
  amount: number;
  fiatAmount: number;
  timestamp: number;
  details: string;
  hash?: string;
  status?: 'pending' | 'completed' | 'failed';
  blockHeight?: number;
  fromAddress?: string;
  toAddress?: string;
  ledgerDebit?: string; // e.g. "Asset Holding Account (BTC)"
  ledgerCredit?: string; // e.g. "Cash Vault Account (USD)"
}

export type TimeFrame = '1H' | '1D' | '1W' | '1M' | '1Y' | 'ALL';

export type ChainType = 'Ethereum' | 'Polygon' | 'Base' | 'BNB Chain' | 'Solana' | 'Bitcoin';

export interface ChainConfig {
  name: ChainType;
  symbol: string;
  decimals: number;
  rpcUrl: string;
  explorerUrl: string;
  icon: string;
  color: string;
}

export interface BlockchainTransaction {
  txId: string;
  hash: string;
  chain: ChainType;
  type: 'send' | 'receive';
  fromAddress: string;
  toAddress: string;
  amount: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: string;
}

export type OperationType =
  | 'read'
  | 'write'
  | 'create'
  | 'update'
  | 'delete'
  | 'query'
  | 'transaction';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
    emailVerified: boolean | null;
    isAnonymous: boolean | null;
  };
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  rewardAmount: number;
  rewardSymbol: string;
  questions: QuizQuestion[];
  completed: boolean;
}
