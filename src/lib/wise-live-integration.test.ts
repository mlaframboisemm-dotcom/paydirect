import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWiseBalanceAmount } from './wise-live-integration.js';

test('parses zero-valued Wise balance objects without turning them into NaN', () => {
  const parsed = parseWiseBalanceAmount({ value: 0.0, currency: 'USD' });
  assert.equal(parsed, 0);
});

test('falls back to cash amount when amount is unavailable', () => {
  const parsed = parseWiseBalanceAmount({ amount: null, cashAmount: { value: 125.5, currency: 'CAD' } });
  assert.equal(parsed, 125.5);
});
