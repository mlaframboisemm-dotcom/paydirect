import assert from 'node:assert/strict';
import { getLiveWalletSnapshot, getPrimaryWalletAddress } from '../src/lib/live-wallet-config';

const snapshot = getLiveWalletSnapshot();
const address = getPrimaryWalletAddress();

assert.ok(address.startsWith('0x'), `expected a hex address, received ${address}`);
assert.ok(snapshot.ledgerBalance > 0, `expected a positive ledger balance, received ${snapshot.ledgerBalance}`);
assert.ok(snapshot.tokens.length > 0, 'expected wallet tokens to be loaded from the database');
assert.ok(snapshot.tokens.some((token) => token.symbol === 'USD' || token.symbol === 'USDC' || token.symbol === 'USDF'), 'expected a USD-related token in the snapshot');

console.log('live wallet config ok', { address, ledgerBalance: snapshot.ledgerBalance, tokenCount: snapshot.tokens.length });
