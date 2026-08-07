import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from './src/db/ledger.js';
import { generateSessionId, signSessionToken } from './src/lib/auth-security.js';

const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env.production'),
  path.join(process.cwd(), '.env.production.local'),
  path.join(process.cwd(), 'config', '.env.credentials')
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface DirectDebitResponse {
  success?: boolean;
  message?: string;
  transactionId?: string;
  wiseTransferId?: string;
  status?: string;
  error?: string;
  [key: string]: any;
}

async function testWiseE2E() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  WISE DIRECT DEBIT END-TO-END TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    console.log('Step 1: Creating test user...');
    const uniqueSuffix = crypto.randomBytes(6).toString('hex');
    const testUserId = `test-wise-user-${Date.now()}-${uniqueSuffix}`;
    const testEmail = `wise-test-${Date.now()}-${uniqueSuffix}@test.local`;
    const testPassword = 'TestPassword123!@#';

    db.execute(
      `
      INSERT INTO users (id, name, email, passwordHash, salt, twoFactorSecret, twoFactorEnabled, kycLevel, citizenship)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        testUserId,
        `Test User ${uniqueSuffix}`,
        testEmail,
        testPassword,
        '',
        '',
        0,
        1,
        'US'
      ]
    );

    console.log(`  User created: ${testUserId}`);

    console.log('Step 2: Creating pending transaction...');
    const txId = `tx-wise-${Date.now()}`;
    const amount = 100.0;

    db.execute(
      `
      INSERT INTO transactions (id, user_id, type, asset_symbol, amount, fiat_amount, timestamp, details, hash, status, ledger_debit, ledger_credit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        txId,
        testUserId,
        'WISE_WITHDRAWAL',
        'USD',
        amount,
        amount,
        Date.now(),
        JSON.stringify({ description: 'Test Wise Direct Debit Withdrawal' }),
        '',
        'pending',
        amount,
        0.0
      ]
    );

    console.log(`  Transaction created: ${txId}`);

    console.log('Step 3: Generating auth session...');
    generateSessionId();
    const authSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'local-dev-secret-please-change';
    const sessionToken = signSessionToken({ sub: testUserId } as any, authSecret);

    console.log('Step 4: Initiating direct debit withdrawal...');
    const directDebitPayload = {
      amount,
      bankRouting: '021000021',
      bankAccount: '9900000000',
      recipientName: 'Production Rail Test',
      currency: 'USD',
      address: {
        country: 'US',
        city: 'New York',
        postCode: '10001',
        firstLine: '123 Test Street',
        state: 'NY'
      }
    };

    const directDebitRes = await fetch(`${BASE_URL}/api/withdrawal/wise-direct-debit/${txId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
        'X-User-ID': testUserId,
        'X-Idempotency-Key': `wise-direct-${txId}`
      },
      body: JSON.stringify(directDebitPayload)
    });

    console.log(`  Response Status: ${directDebitRes.status}`);
    const directDebitData = (await directDebitRes.json()) as DirectDebitResponse;
    console.log(`  Response: ${JSON.stringify(directDebitData)}`);

    if (directDebitRes.status !== 202 || !directDebitData.wiseTransferId) {
      throw new Error(`Unexpected direct debit response status: ${directDebitRes.status}`);
    }

    console.log('Step 5: Checking transfer status...');
    const statusRes = await fetch(`${BASE_URL}/api/withdrawal/wise-status/${directDebitData.wiseTransferId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'X-User-ID': testUserId
      }
    });

    const statusData = await statusRes.json();
    console.log(`  Status Response: ${JSON.stringify(statusData)}`);

    const updatedTx = db.getTransaction(txId) as any;
    if (!updatedTx) {
      throw new Error('Ledger transaction not found after direct debit request');
    }

    console.log('Direct debit E2E result: PASS');
  } catch (err: any) {
    console.error('Direct debit E2E result: FAIL');
    console.error(err?.message || String(err));
    process.exitCode = 1;
  }
}

testWiseE2E().catch((err) => {
  console.error(err);
  process.exit(1);
});
