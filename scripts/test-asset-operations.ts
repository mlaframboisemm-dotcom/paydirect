import assert from 'node:assert/strict';
import { getAssetTransferLabel, getAssetWalletAddress, isAssetAddressable, mergeAssetOptions, validateAssetAddress } from '../src/lib/asset-operations';

const coins = [
  { symbol: 'BTC', name: 'Bitcoin', price: 60000 },
  { symbol: 'ETH', name: 'Ethereum', price: 3000 }
];

const holdings = [
  { symbol: 'USDC', amount: 250 },
  { symbol: 'SOL', amount: 40 }
];

const options = mergeAssetOptions(coins, holdings);
assert.ok(options.some((asset) => asset.symbol === 'BTC'));
assert.ok(options.some((asset) => asset.symbol === 'USDC'));
assert.ok(options.some((asset) => asset.symbol === 'SOL'));
assert.equal(options.find((asset) => asset.symbol === 'SOL')?.amount, 40);

assert.equal(getAssetWalletAddress('BTC').startsWith('bc1'), true);
assert.equal(isAssetAddressable('USD'), false);
assert.equal(validateAssetAddress('BTC', 'bc1q9rny26szrgl26u64mdg0cuhvpt2p77jwh792ka'), true);
assert.equal(validateAssetAddress('ETH', '0x71C7656EC7ab88b098defB751B7401B5f6d1476B'), true);
assert.equal(validateAssetAddress('SOL', 'FvJDg947zY8f4L6kSghB8b9uUv9T8ZzK1C2xL7N3aU'), true);
assert.equal(getAssetTransferLabel('SOL'), 'Solana address');

console.log('Asset operations regression checks passed.');
