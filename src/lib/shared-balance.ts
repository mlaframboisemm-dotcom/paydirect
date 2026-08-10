export interface SharedBalanceInput {
  preferredUsdBalance?: number;
  preferredCadBalance?: number;
  fallbackUsdBalance?: number;
  fallbackCadBalance?: number;
  cadToUsdRate?: number;
}

export interface SharedBalanceState {
  usdBalance: number;
  cadBalance: number;
}

export function resolveSharedBalance(input: SharedBalanceInput): SharedBalanceState {
  const cadToUsdRate = Number.isFinite(input.cadToUsdRate) && input.cadToUsdRate! > 0 ? input.cadToUsdRate : 1.3602;

  const preferredUsd = Number.isFinite(input.preferredUsdBalance) ? Number(input.preferredUsdBalance) : NaN;
  const preferredCad = Number.isFinite(input.preferredCadBalance) ? Number(input.preferredCadBalance) : NaN;
  const fallbackUsd = Number.isFinite(input.fallbackUsdBalance) ? Number(input.fallbackUsdBalance) : NaN;
  const fallbackCad = Number.isFinite(input.fallbackCadBalance) ? Number(input.fallbackCadBalance) : NaN;

  const usdBalance = Number.isFinite(preferredUsd) && preferredUsd >= 0
    ? preferredUsd
    : Number.isFinite(fallbackUsd) && fallbackUsd >= 0
      ? fallbackUsd
      : 0;

  const cadBalance = Number.isFinite(preferredCad) && preferredCad >= 0
    ? preferredCad
    : Number.isFinite(fallbackCad) && fallbackCad >= 0
      ? fallbackCad
      : Number.isFinite(preferredUsd) && preferredUsd >= 0
        ? preferredUsd * cadToUsdRate
        : Number.isFinite(fallbackUsd) && fallbackUsd >= 0
          ? fallbackUsd * cadToUsdRate
          : 0;

  return {
    usdBalance,
    cadBalance
  };
}
