import { convertUsdToCad, DEFAULT_USD_CAD_RATE } from './financial-hardening';

export function normalizeCadAmount(value: number): number {
  const parsed = Number.isFinite(value) ? value : 0;
  return Math.round(parsed * 100) / 100;
}

export function toCadAmount(value: number, fxRate: number = DEFAULT_USD_CAD_RATE): number {
  return normalizeCadAmount(convertUsdToCad(value, fxRate));
}

export function calculateCadSpendableBalance(params: {
  liveCadBalance?: number;
  linkedPlaidCadBalance?: number;
  stripeCadBalance?: number;
  ledgerCadBalance?: number;
}): number {
  const total = (params.liveCadBalance || 0) + (params.linkedPlaidCadBalance || 0) + (params.stripeCadBalance || 0) + (params.ledgerCadBalance || 0);
  return normalizeCadAmount(Math.max(0, total));
}

export function formatCadAmount(value: number): string {
  return normalizeCadAmount(value).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
