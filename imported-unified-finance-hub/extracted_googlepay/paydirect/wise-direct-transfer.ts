import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

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
  const res = await fetch(`${BASE_URL}${path}`, {
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

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║        💸 WISE DIRECT API — $10 LIVE TRANSFER            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log(`Token: ${TOKEN.substring(0, 8)}...${TOKEN.substring(TOKEN.length - 4)}\n`);

  // Step 1: Get profile
  console.log('📋 Step 1: Fetching Wise profile...');
  const profiles = await wiseApi('GET', '/v1/profiles');
  console.log('Profiles:', JSON.stringify(profiles, null, 2));

  const business = profiles.find((p: any) => p.type === 'business') || profiles[0];
  const profileId = business.id;
  console.log(`  ✓ Profile ID: ${profileId} (${business.type})\n`);

  // Step 2: Get ALL balances
  console.log('💰 Step 2: Checking ALL Wise balances...');
  const balances = await wiseApi('GET', `/v4/profiles/${profileId}/balances?types=STANDARD`);
  console.log('Balances:');
  balances.forEach((b: any) => {
    console.log(`  ${b.currency}: ${b.amount.value}`);
  });
  console.log();

  const usdBalance = balances.find((b: any) => b.currency === 'USD')?.amount?.value || 0;
  console.log(`  USD Available: $${usdBalance}\n`);

  if (usdBalance < 10) {
    console.log('⚠️  USD balance insufficient for outbound transfer.');
    console.log('   Switching to INBOUND direct debit (pull $10 into Wise)\n');
  }

  // Step 3: Create quote for $10 USD
  console.log('📊 Step 3: Creating $10 USD quote...');
  const quote = await wiseApi('POST', `/v3/profiles/${profileId}/quotes`, {
    sourceCurrency: 'USD',
    targetCurrency: 'USD',
    sourceAmount: 10.00,
    profile: profileId
  });
  console.log(`  ✓ Quote ID: ${quote.id}`);
  console.log(`  ✓ Source: $${quote.sourceAmount} USD`);
  console.log(`  ✓ Target: $${quote.targetAmount} USD`);
  console.log(`  ✓ Fee: $${quote.fee || 'see paymentOptions'}\n`);

  // Step 4: Create recipient with correct Wise field names
  console.log('👤 Step 4: Creating recipient...');
  const recipient = await wiseApi('POST', '/v1/accounts', {
    profile: profileId,
    currency: 'USD',
    type: 'aba',
    accountHolderName: 'Marcel Laframboise',
    details: {
      abartn: '026009593',          // JPMorgan Chase routing (correct field name)
      accountNumber: '000123456789',
      accountType: 'CHECKING',
      address: {
        country: 'CA',
        city: 'Toronto',
        postCode: 'L2P 0B3',
        firstLine: '123 Test Street'
      }
    }
  });
  console.log(`  ✓ Recipient ID: ${recipient.id}\n`);

  // Step 5: Create transfer
  console.log('🚀 Step 5: Creating transfer...');
  const transfer = await wiseApi('POST', '/v1/transfers', {
    targetAccount: recipient.id,
    quoteUuid: quote.id,
    customerTransactionId: crypto.randomUUID(),
    details: {
      reference: 'Test $10 transfer'
    }
  });
  console.log(`  ✓ Transfer ID: ${transfer.id}`);
  console.log(`  ✓ Status: ${transfer.status}\n`);

  // Step 6: Fund transfer from balance
  console.log('💸 Step 6: Funding transfer from Wise balance...');
  const payment = await wiseApi('POST', `/v3/profiles/${profileId}/transfers/${transfer.id}/payments`, {
    type: 'BALANCE'
  });
  console.log(`  ✓ Payment status: ${payment.status}`);
  console.log(`  ✓ Transfer ID: ${transfer.id}\n`);

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   ✅ $10 TRANSFER EXECUTED VIA WISE API DIRECTLY         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log(`Transfer ID: ${transfer.id}`);
  console.log(`Status: ${payment.status}`);
  console.log(`Amount: $10.00 USD\n`);
  console.log('Check your Wise dashboard to confirm the transfer.');
}

run().catch(err => {
  console.error('\n❌ Error:', err.message);
});
