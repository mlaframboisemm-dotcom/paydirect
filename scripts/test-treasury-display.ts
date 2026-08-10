import assert from 'node:assert/strict';
import { buildTreasuryDisplayState } from '../src/lib/treasury-display.js';

const state = buildTreasuryDisplayState(1000, 1362.2, 1.3622);
assert.equal(state.usdBalance, 1000);
assert.equal(state.cadBalance, 1362.2);
assert.equal(state.cadEquivalentLabel, 'CA$1,362.20');
assert.equal(state.usdEquivalentLabel, 'US$1,000.00');
assert.equal(state.summaryLabel, 'US$1,000.00 • CA$1,362.20');

console.log('treasury display test passed');
