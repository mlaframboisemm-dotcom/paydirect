import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestResult } from './external-verification.js';
import { getFinancialOperationVerificationSummary } from './critical-operations-enforcer.js';

test('reports pending verification as awaiting external confirmation', () => {
  const result = createTestResult(
    true,
    { amount: '100', currency: 'USD' },
    {
      type: 'payment',
      status: 'pending',
      referenceId: 'ref_123',
      rawResponse: {},
      timestamp: new Date().toISOString(),
      externalSource: 'wise',
    },
  );

  const summary = getFinancialOperationVerificationSummary(result);

  assert.equal(summary.isVerified, false);
  assert.equal(summary.status, 'pending');
  assert.match(summary.message, /awaiting external confirmation/i);
});

test('marks verified proof as verified', () => {
  const result = createTestResult(
    true,
    { amount: '100', currency: 'USD' },
    {
      type: 'payment',
      status: 'verified',
      referenceId: 'ref_123',
      rawResponse: {},
      timestamp: new Date().toISOString(),
      externalSource: 'wise',
    },
  );

  const summary = getFinancialOperationVerificationSummary(result);

  assert.equal(summary.isVerified, true);
  assert.equal(summary.status, 'verified');
  assert.match(summary.message, /verified/i);
});
