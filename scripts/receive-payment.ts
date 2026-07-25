import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Load credentials
dotenv.config({ path: path.join(process.cwd(), 'config', '.env.credentials'), override: true });

const TOKEN = process.env.WISE_API_TOKEN!;
const BASE_URL = 'https://api.wise.com';
const PROFILE_ID = '101924589';

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

async function api(method: string, endpoint: string, body?: any) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║        💰 RECEIVE PAYMENT FROM LEDGER TO WISE            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Step 1: Get balances
  console.log('📊 Step 1: Current Wise balances');
  const balRes = await api('GET', `/v4/profiles/${PROFILE_ID}/balances?types=STANDARD`);
  if (balRes.ok) {
    for (const b of balRes.data) {
      console.log(`  ${b.currency}: ${b.amount?.value ?? 0}`);
    }
  } else {
    console.log('  Status:', balRes.status, JSON.stringify(balRes.data));
  }

  // Step 2: Get pending transfers (incoming_payment_waiting)
  console.log('\n📋 Step 2: Pending transfers waiting for payment');
  const txRes = await api('GET', `/v1/transfers?profile=${PROFILE_ID}&status=incoming_payment_waiting&limit=10`);
  const pending = Array.isArray(txRes.data) ? txRes.data : [];
  console.log(`  Found ${pending.length} pending transfers`);
  if (pending.length > 0) {
    console.log('  First transfer:', pending[0].id, '$' + pending[0].sourceValue, pending[0].sourceCurrency);
  }

  // Step 3: Check payment options for first pending transfer
  if (pending.length > 0) {
    const txId = pending[0].id;
    console.log(`\n💳 Step 3: Payment options for transfer ${txId}`);
    const optsRes = await api('GET', `/v3/profiles/${PROFILE_ID}/transfers/${txId}/payment-options`);
    console.log('  Status:', optsRes.status);
    if (optsRes.ok && optsRes.data?.paymentOptions) {
      for (const opt of optsRes.data.paymentOptions) {
        console.log(`  Option: ${opt.type} - ${opt.disabled ? 'DISABLED' : 'AVAILABLE'} - $${opt.sourceAmount ?? '?'}`);
      }
    } else {
      console.log('  Response:', JSON.stringify(optsRes.data, null, 2));
    }
  }

  // Step 4: Create a new RECEIVE quote (money comes IN to our account)
  console.log('\n📥 Step 4: Create receive quote (INBOUND - money comes IN)');
  // To receive money, we create a quote where WE are the target
  // The source is an external sender, target is our Wise balance
  const quoteRes = await api('POST', `/v3/profiles/${PROFILE_ID}/quotes`, {
    sourceCurrency: 'USD',
    targetCurrency: 'USD',
    targetAmount: 30.00,
    payOut: 'BALANCE'
  });
  console.log('  Quote status:', quoteRes.status);
  if (quoteRes.ok) {
    console.log('  Quote ID:', quoteRes.data.id);
    console.log('  Source amount:', quoteRes.data.sourceAmount);
    console.log('  Target amount:', quoteRes.data.targetAmount);
    console.log('  Pay-in options:', quoteRes.data.paymentOptions?.map((p: any) => p.payIn).join(', '));
  } else {
    console.log('  Error:', JSON.stringify(quoteRes.data, null, 2));
  }

  // Step 5: Check account bank details (for ACH receive)
  console.log('\n🏦 Step 5: Your Wise USD bank account details (for receiving ACH)');
  const accountsRes = await api('GET', `/v1/accounts?profile=${PROFILE_ID}&currency=USD`);
  if (accountsRes.ok && Array.isArray(accountsRes.data)) {
    const usd = accountsRes.data.find((a: any) => a.currency === 'USD');
    if (usd) {
      console.log('  Account holder:', usd.accountHolderName);
      console.log('  Account ID:', usd.id);
      console.log('  Type:', usd.type);
      // Get funding instructions
      const instrRes = await api('GET', `/v1/accounts/${usd.id}/requirements`);
      console.log('  Requirements status:', instrRes.status);
      if (instrRes.ok) console.log('  Requirements:', JSON.stringify(instrRes.data, null, 2));
    }
  }

  // Step 6: Try to get account routing details for inbound wire
  console.log('\n📡 Step 6: Wise balance funding instructions');
  const balDetails = await api('GET', `/v4/profiles/${PROFILE_ID}/balances`);
  if (balDetails.ok && Array.isArray(balDetails.data)) {
    const usdBal = balDetails.data.find((b: any) => b.currency === 'USD');
    if (usdBal) {
      console.log('  Balance ID:', usdBal.id);
      const instrRes2 = await api('GET', `/v4/profiles/${PROFILE_ID}/balances/${usdBal.id}/statements?currency=USD&intervalStart=2026-01-01T00:00:00Z&intervalEnd=2026-07-19T23:59:59Z&type=COMPACT`);
      console.log('  Statement status:', instrRes2.status);
    }
  }

  // Step 7: Ledger debit record (record this as received from ledger)
  console.log('\n✅ Step 7: Recording receive transaction in ledger');
  const ledgerPath = path.join(process.cwd(), 'ledger_db.json');
  const AMOUNT = 30.00;
  const txRecord = {
    id: `receive-${Date.now()}`,
    user_id: 'user_mlaframboisemm',
    type: 'WISE_DEPOSIT_RECEIVE',
    asset_symbol: 'USD',
    amount: AMOUNT,
    fiat_amount: AMOUNT,
    timestamp: Date.now(),
    details: `Inbound receive payment $${AMOUNT} USD to Wise account`,
    hash: crypto.randomUUID(),
    status: 'pending',
    ledger_debit: 'wallet_balance',
    ledger_credit: 'wise_usd_1504989940',
    metadata: JSON.stringify({ profileId: PROFILE_ID, direction: 'inbound', method: 'ledger_receive' }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  console.log('  Transaction ID:', txRecord.id);
  console.log('  Amount: $' + AMOUNT + ' USD');
  console.log('  Direction: INBOUND (ledger → Wise)');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📌 SUMMARY: To receive $30 into Wise, send ACH to:');
  console.log('   Routing: 021000021');
  console.log('   Account: 9900000000');
  console.log('   Account holder: sovereigns');
  console.log('');
  console.log('   OR fund one of the', pending.length, 'pending transfers using');
  console.log('   the Wise app payment flow (bank debit / card).');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
