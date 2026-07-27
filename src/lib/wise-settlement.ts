export function resolveWiseSettlementAmount(
  txn: { amount?: number | string; assetSymbol?: string; details?: string | Record<string, any> },
  wiseAmount: number | string | null | undefined,
  wiseCurrency?: string | null
) {
  const parsedTxnAmount = Number(txn?.amount ?? 0);
  const parsedWiseAmount = Number(wiseAmount ?? 0);
  const normalizedCurrency = String(wiseCurrency || txn?.assetSymbol || 'USD').trim().toUpperCase();

  const fallbackAmount = Number.isFinite(parsedTxnAmount) && parsedTxnAmount > 0 ? parsedTxnAmount : 0;
  const resolvedAmount = Number.isFinite(parsedWiseAmount) && parsedWiseAmount > 0 ? parsedWiseAmount : fallbackAmount;

  return {
    amount: Number(resolvedAmount.toFixed(2)),
    currency: normalizedCurrency
  };
}
