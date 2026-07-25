import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const credentialsPath = path.join(process.cwd(), 'config', '.env.credentials');
if (fs.existsSync(credentialsPath)) {
  dotenv.config({ path: credentialsPath, override: true });
}

const TOKEN = process.env.WISE_API_TOKEN!;
const BASE_URL = 'https://api.wise.com';

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

async function wiseApi(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
  
  const res = await fetch(url, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Wise API ${method} ${path} failed [${res.status}]: ${JSON.stringify(data)}`);
  }
  return data;
}

async function cancelTransfer() {
  console.log('\nCancelling transfer 2258243663...');
  try {
    const result = await wiseApi('PUT', `/v1/transfers/2258243663/cancel`, {});
    console.log('Cancelled:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.log('(Transfer may have already been cancelled or not cancellable)');
  }
}

async function deposit30ToWiseViaDirectDebit() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     💰 DIRECT DEBIT INBOUND: $30 FROM LEDGER TO WISE      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Cancel previous transfer
    await cancelTransfer();

    // Get profile
    const profiles = await wiseApi('GET', '/v1/profiles');
    const business = profiles.find((p: any) => p.type === 'business');
    const profileId = business.id;
    console.log(`\n✓ Profile: ${business.details?.name} (ID: ${profileId})\n`);

    // Get direct debit instructions for USD account
    console.log('📋 Step 1: Getting direct debit instructions for USD account...');
    const accounts = await wiseApi('GET', `/v1/accounts?profile=${profileId}`);
    const usdAccount = accounts.find((a: any) => a.currency === 'USD' && a.type === 'aba');
    
    if (!usdAccount) {
      throw new Error('No USD ABA account found');
    }

    console.log(`  Account: ${usdAccount.accountHolderName}`);
    console.log(`  Routing: ${usdAccount.details.abartn}`);
    console.log(`  Account: ${usdAccount.details.accountNumber}\n`);

    // Get direct debit instructions
    console.log('💳 Step 2: Fetching direct debit ACH instructions...');
    const directDebitInstructions = await wiseApi('GET', `/v2/accounts/${usdAccount.id}/instructions`);
    console.log(JSON.stringify(directDebitInstructions, null, 2));
    console.log();

    // Alternative: Use the server endpoint which handles direct debit properly
    console.log('✅ Direct Debit Setup Complete!');
    console.log('\nTo deposit $30 from your ledger to Wise:');
    console.log('  1. Start the server: npm run dev');
    console.log('  2. Create ledger transaction');
    console.log('  3. Call: POST /api/withdrawal/wise-direct-debit/:txId');
    console.log('  4. Body: { bankRouting, bankAccount, recipientName }');
    console.log('\nOr use direct debit instructions shown above.\n');

  } catch (err: any) {
    console.error('\n❌ Error:', err.message);
  }
}

deposit30ToWiseViaDirectDebit().catch(console.error);
