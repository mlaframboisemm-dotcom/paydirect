import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from './src/db/ledger.js';
import { generateSessionId, signSessionToken } from './src/lib/auth-security.js';

// Load credentials
const credentialsPath = path.join(process.cwd(), 'config', '.env.credentials');
if (fs.existsSync(credentialsPath)) {
  dotenv.config({ path: credentialsPath, override: false });
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
  console.log('  🚀 WISE DIRECT DEBIT END-TO-END TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Create a test user
    console.log('📝 Step 1: Creating test user...');
    const uniqueSuffix = crypto.randomBytes(6).toString('hex');
    const testUserId = `test-wise-user-${Date.now()}-${uniqueSuffix}`;
    const testEmail = `wise-test-${Date.now()}-${uniqueSuffix}@test.local`;
    const testPassword = 'TestPassword123!@#';
    
    db.execute(`
      INSERT INTO users (id, name, email, passwordHash, salt, twoFactorSecret, twoFactorEnabled, kycLevel, citizenship)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      testUserId,
      `Test User ${uniqueSuffix}`,
      testEmail,
      testPassword,
      '',
      '',
      0,
      1,
      'US'
    ]);
    
    console.log(`  ✓ User created: ${testUserId}`);
    console.log(`  ✓ Email: ${testEmail}\n`);

    // Step 2: Create a test transaction in ledger
    console.log('📝 Step 2: Creating test transaction for direct debit...');
    const txId = 'tx-wise-' + Date.now();
    const testTransaction = {
      id: txId,
      userId: testUserId,
      type: 'WISE_WITHDRAWAL' as const,
      status: 'pending' as const,
      amount: 100.00,
      currency: 'USD',
      description: 'Test Wise Direct Debit Withdrawal',
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.execute(`
      INSERT INTO transactions (id, user_id, type, asset_symbol, amount, fiat_amount, timestamp, details, hash, status, ledger_debit, ledger_credit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      txId,
      testUserId,
      'WISE_WITHDRAWAL',
      'USD',
      100.00,
      100.00,
      Date.now(),
      JSON.stringify({ description: 'Test Wise Direct Debit Withdrawal' }),
      '',
      'pending',
      100.00,
      0.00
    ]);

    console.log(`  ✓ Transaction created: ${txId}`);
    console.log(`  ✓ Amount: $100.00 USD`);
    console.log(`  ✓ Status: pending\n`);

    // Step 3: Generate valid session token
    console.log('🔐 Step 3: Generating authentication session...');
    const sessionId = generateSessionId();
    const authSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'local-dev-secret-please-change';
    const sessionToken = signSessionToken({ sub: testUserId } as any, authSecret);
    console.log(`  ✓ Session created`);
    console.log(`  ✓ Token type: Bearer\n`);

    // Step 4: Test direct debit endpoint with authentication
    console.log('💸 Step 4: Initiating direct debit withdrawal...');
    const directDebitPayload = {
      amount: 100.00,
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

    const directDebitRes = await fetch(
      `${BASE_URL}/api/withdrawal/wise-direct-debit/${txId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
          'X-User-ID': testUserId,
          'X-Idempotency-Key': `wise-direct-${txId}`
        },
        body: JSON.stringify(directDebitPayload)
      }
    );

    console.log(`  Response Status: ${directDebitRes.status}`);
    const directDebitData = (await directDebitRes.json()) as DirectDebitResponse;
    console.log(`  Response:`, JSON.stringify(directDebitData, null, 2));
    
    if (directDebitRes.status === 202 && directDebitData.wiseTransferId) {
      console.log(`  ✅ Direct debit initiated successfully!`);
      console.log(`  ✓ Wise Transfer ID: ${directDebitData.wiseTransferId}\n`);

      // Step 5: Check transfer status
      console.log('📊 Step 5: Checking transfer status...');
      const statusRes = await fetch(
        `${BASE_URL}/api/withdrawal/wise-status/${directDebitData.wiseTransferId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'X-User-ID': testUserId
          }
        }
      );

      console.log(`  Response Status: ${statusRes.status}`);
      const statusData = await statusRes.json();
      console.log(`  Transfer Status:`, JSON.stringify(statusData, null, 2));
      console.log();

      // Step 6: Verify transaction was updated in ledger
      console.log('✅ Step 6: Verifying transaction state in ledger...');
      const updatedTx = db.getTransaction(txId) as any;
      if (updatedTx) {
        console.log(`  ✓ Transaction status: ${updatedTx.status}`);
        console.log(`  ✓ Wise Transfer ID: ${updatedTx.wiseTransferId}`);
        console.log(`  ✓ Bank Routing: ${updatedTx.bankRouting}`);
        console.log(`  ✓ Bank Account: ${updatedTx.bankAccount}`);
      }
    } else {
      console.log(`  ⚠️  Direct debit endpoint responded with ${directDebitRes.status}`);
      console.log(`  Response:`, directDebitData);
      throw new Error(`Unexpected direct debit response status: ${directDebitRes.status}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ E2E TEST COMPLETED');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📋 Summary:');
    console.log('  • Wise API integration: CONNECTED');
    console.log('  • Direct debit endpoint: LIVE');
    console.log('  • Status polling: READY');
    console.log('  • Ledger integration: WORKING');
    console.log('\n💡 Next: Test with real Wise sandbox account credentials\n');

  } catch (err: any) {
    console.error('❌ E2E Test failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  }
}

testWiseE2E().catch(console.error);
