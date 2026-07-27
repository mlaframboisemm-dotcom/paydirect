import { resolveWiseSettlementAmount } from '../src/lib/wise-settlement.ts';

const tx = { amount: 10, assetSymbol: 'USD' } as any;
const resolved = resolveWiseSettlementAmount(tx, 25, 'USD');

if (resolved.amount !== 25) {
  throw new Error(`Expected Wise amount 25, got ${resolved.amount}`);
}

if (resolved.currency !== 'USD') {
  throw new Error(`Expected currency USD, got ${resolved.currency}`);
}

console.log('wise-settlement test passed');
