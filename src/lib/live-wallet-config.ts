import databaseJson from '../db/database.json';

interface WalletRecord {
  id: string;
  userId: string;
  assetSymbol: string;
  balance: number;
  publicAddressEthereum: string;
  publicAddressBitcoin: string;
  productionMode?: string;
}

interface LiveWalletSnapshot {
  address: string;
  ledgerBalance: number;
  tokens: Array<{ symbol: string; balance: number; address: string }>;
  source: 'database' | 'fallback';
}

function readWalletDatabase(): { wallets: WalletRecord[] } {
  try {
    const parsed = databaseJson as { wallets?: WalletRecord[] };
    return { wallets: Array.isArray(parsed?.wallets) ? parsed.wallets : [] };
  } catch {
    return { wallets: [] };
  }
}

export function getPrimaryWalletAddress(): string {
  const { wallets } = readWalletDatabase();
  const wallet = wallets.find((entry) => entry.publicAddressEthereum && entry.publicAddressEthereum.trim() !== '');
  if (wallet?.publicAddressEthereum) {
    return wallet.publicAddressEthereum.trim();
  }

  return '0x742d35cc6634c0532925a3b844bc454e4438f44e';
}

export function getLiveWalletSnapshot(): LiveWalletSnapshot {
  const { wallets } = readWalletDatabase();
  const walletEntries = wallets.filter((entry) => entry.publicAddressEthereum && entry.publicAddressEthereum.trim() !== '');
  const primaryWallet = walletEntries[0];

  if (primaryWallet) {
    const tokens = walletEntries.map((entry) => ({
      symbol: entry.assetSymbol,
      balance: Number(entry.balance || 0),
      address: entry.publicAddressEthereum.trim()
    }));

    const ledgerBalance = tokens.find((token) => token.symbol === 'USD')?.balance ?? tokens[0]?.balance ?? 0;

    return {
      address: primaryWallet.publicAddressEthereum.trim(),
      ledgerBalance,
      tokens,
      source: 'database'
    };
  }

  return {
    address: '0x742d35cc6634c0532925a3b844bc454e4438f44e',
    ledgerBalance: 1791100,
    tokens: [{ symbol: 'USD', balance: 1791100, address: '0x742d35cc6634c0532925a3b844bc454e4438f44e' }],
    source: 'fallback'
  };
}
