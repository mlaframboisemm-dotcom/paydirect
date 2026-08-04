export interface TreasuryDisplayState {
  usdBalance: number;
  cadBalance: number;
  usdEquivalentLabel: string;
  cadEquivalentLabel: string;
  summaryLabel: string;
}

export function buildTreasuryDisplayState(
  usdBalance: number,
  cadBalance: number,
  usdCadRate: number = 1.3622
): TreasuryDisplayState {
  const normalizedUsd = Number.isFinite(usdBalance) ? Number(usdBalance) : 0;
  const normalizedCad = Number.isFinite(cadBalance) ? Number(cadBalance) : 0;

  return {
    usdBalance: normalizedUsd,
    cadBalance: normalizedCad,
    usdEquivalentLabel: `US$${normalizedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    cadEquivalentLabel: `CA$${normalizedCad.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    summaryLabel: `US$${normalizedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • CA$${normalizedCad.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  };
}
