import type { Coin, Holding } from '../types';

export interface AssetOption {
  symbol: string;
  name: string;
  price: number;
  amount: number;
}

function normalizeSymbol(symbol: string): string {
  return String(symbol || '').trim().toUpperCase();
}

export function mergeAssetOptions(coins: Coin[] = [], holdings: Holding[] = []): AssetOption[] {
  const assetMap = new Map<string, AssetOption>();

  for (const coin of coins || []) {
    if (!coin?.symbol) continue;
    const symbol = normalizeSymbol(coin.symbol);
    assetMap.set(symbol, {
      symbol,
      name: coin.name || symbol,
      price: Number(coin.price || 0),
      amount: 0
    });
  }

  for (const holding of holdings || []) {
    if (!holding?.symbol) continue;
    const symbol = normalizeSymbol(holding.symbol);
    const existing = assetMap.get(symbol);
    assetMap.set(symbol, {
      symbol,
      name: existing?.name || symbol,
      price: existing?.price || 0,
      amount: Number(holding.amount || 0)
    });
  }

  return Array.from(assetMap.values()).sort((left, right) => {
    if (right.amount !== left.amount) {
      return right.amount - left.amount;
    }
    return left.symbol.localeCompare(right.symbol);
  });
}

export function getAssetWalletAddress(symbol: string): string {
  const normalized = normalizeSymbol(symbol);

  switch (normalized) {
    case 'BTC':
      return 'bc1q9rny26szrgl26u64mdg0cuhvpt2p77jwh792ka';
    case 'ETH':
      return '0x71C7656EC7ab88b098defB751B7401B5f6d1476B';
    case 'SOL':
      return 'FvJDg947zY8f4L6kSghB8b9uUv9T8ZzK1C2xL7N3aU';
    case 'XRP':
      return 'rEb8TK3gYQCfyAam7C16m6W8ZfS23nVTwk';
    case 'USDC':
      return '0x71C7656EC7ab88b098defB751B7401B5f6d1476B';
    case 'USDT':
      return '0x71C7656EC7ab88b098defB751B7401B5f6d1476B';
    case 'USDF':
      return '0x71C7656EC7ab88b098defB751B7401B5f6d1476B';
    case 'XAUT':
      return '0x71C7656EC7ab88b098defB751B7401B5f6d1476B';
    case 'USD':
    case 'CAD':
      return '';
    default:
      return '0x39a1D8B4eC6294D290F571bF8C28b173Fdb920a6';
  }
}

export function isAssetAddressable(symbol: string): boolean {
  const normalized = normalizeSymbol(symbol);
  return normalized !== 'USD' && normalized !== 'CAD';
}

export function validateAssetAddress(symbol: string, address: string): boolean {
  const normalized = normalizeSymbol(symbol);
  if (!address || !address.trim()) return false;
  if (!isAssetAddressable(normalized)) return false;

  if (normalized === 'BTC') {
    return /^(bc1[a-zA-HJ-NP-Z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address.trim());
  }

  if (normalized === 'SOL') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
  }

  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function getAssetTransferLabel(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  if (normalized === 'BTC') return 'Bitcoin address';
  if (normalized === 'SOL') return 'Solana address';
  return 'EVM address';
}
