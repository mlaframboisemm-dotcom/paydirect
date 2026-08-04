export interface Coinbase55LedgerSummary {
  success: boolean;
  source: string;
  asOf: string;
  walletCount: number;
  transactionCount: number;
  balances: Record<string, number>;
}

export interface Coinbase55LedgerWallet {
  id: string;
  userId?: string;
  assetSymbol: string;
  balance: number;
  [key: string]: any;
}

export interface Coinbase55LedgerTransactionsResponse {
  success: boolean;
  source: string;
  asOf: string;
  totalCount: number;
  offset: number;
  limit: number;
  transactions: any[];
}

export interface Coinbase55RemoteLedgerState {
  summary?: Coinbase55LedgerSummary;
  wallets?: Coinbase55LedgerWallet[];
  transactions?: any[];
  lastSyncedAt?: string;
  error?: string;
}

export interface Coinbase55IntegrationConfig {
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export function getCoinbase55Config(): Coinbase55IntegrationConfig {
  const baseUrl = String(process.env.COINBASE55_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.COINBASE55_LEDGER_API_KEY || process.env.LEDGER_API_KEY || '').trim();
  return {
    baseUrl,
    apiKey,
    enabled: Boolean(baseUrl)
  };
}

function buildCoinbase55Headers(): Record<string, string> {
  const cfg = getCoinbase55Config();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (cfg.apiKey) {
    headers['X-Ledger-Api-Key'] = cfg.apiKey;
  }

  return headers;
}

async function coinbase55Fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = getCoinbase55Config();
  if (!cfg.baseUrl) {
    throw new Error('Coinbase55 base URL is not configured. Set COINBASE55_BASE_URL.');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${cfg.baseUrl}${normalizedPath}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...buildCoinbase55Headers(),
      ...(init.headers as Record<string, string> | undefined)
    }
  });

  const text = await response.text();
  let json: any = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error: any) {
      throw new Error(`Coinbase55 returned invalid JSON: ${error?.message || error}`);
    }
  }

  if (!response.ok) {
    const message = json?.message || json?.error || response.statusText || 'Unknown Coinbase55 error';
    throw new Error(`Coinbase55 request failed ${response.status}: ${message}`);
  }

  return json as T;
}

export async function fetchCoinbase55LedgerSummary(): Promise<Coinbase55LedgerSummary> {
  return await coinbase55Fetch<Coinbase55LedgerSummary>('/api/withdrawal/ledger/summary');
}

export async function fetchCoinbase55LedgerWallets(): Promise<{ success: boolean; source: string; wallets: Coinbase55LedgerWallet[]; walletCount: number; }> {
  return await coinbase55Fetch<{ success: boolean; source: string; wallets: Coinbase55LedgerWallet[]; walletCount: number; }>('/api/withdrawal/ledger/wallets');
}

export async function fetchCoinbase55LedgerTransactions(limit = 100, offset = 0): Promise<Coinbase55LedgerTransactionsResponse> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return await coinbase55Fetch<Coinbase55LedgerTransactionsResponse>(`/api/withdrawal/ledger/transactions?${query.toString()}`);
}

export async function refreshCoinbase55RemoteLedger(): Promise<Coinbase55RemoteLedgerState> {
  const cfg = getCoinbase55Config();
  if (!cfg.baseUrl) {
    return {
      error: 'Coinbase55 ledger bridge is not configured. Set COINBASE55_BASE_URL.'
    };
  }

  try {
    const summary = await fetchCoinbase55LedgerSummary();
    const walletsResponse = await fetchCoinbase55LedgerWallets();
    const transactionsResponse = await fetchCoinbase55LedgerTransactions(200, 0);

    return {
      summary,
      wallets: walletsResponse.wallets,
      transactions: transactionsResponse.transactions,
      lastSyncedAt: new Date().toISOString()
    };
  } catch (err: any) {
    return {
      error: String(err?.message || err),
      lastSyncedAt: new Date().toISOString()
    };
  }
}
