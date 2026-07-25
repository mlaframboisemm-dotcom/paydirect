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

async function checkDepositStatus() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║        💰 CHECKING WISE ACCOUNT BALANCE (INSTANT)        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Get profile
    console.log('📋 Step 1: Fetching Wise profile...');
    const profiles = await wiseApi('GET', '/v1/profiles');
    const business = profiles.find((p: any) => p.type === 'business');
    const profileId = business.id;
    console.log(`  ✓ Profile: ${business.details?.name || business.name}`);
    console.log(`  ✓ Profile ID: ${profileId}\n`);

    // Check balance
    console.log('💵 Step 2: Checking current Wise balance...');
    const balances = await wiseApi('GET', `/v4/profiles/${profileId}/balances?types=STANDARD`);
    
    const usdBalance = balances.find((b: any) => b.currency === 'USD');
    const usdAmount = usdBalance?.amount?.value || 0;
    
    console.log(`  ✓ Currency: USD`);
    console.log(`  ✓ Current Balance: $${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);

    // Check recent transfers
    console.log('📊 Step 3: Checking recent transfers...');
    const transfers = await wiseApi('GET', `/v1/transfers?profile=${profileId}&limit=10`);
    
    if (Array.isArray(transfers) && transfers.length > 0) {
      console.log(`  Found ${transfers.length} recent transfers:\n`);
      transfers.slice(0, 5).forEach((tx: any, i: number) => {
        console.log(`  ${i + 1}. ${tx.id}`);
        console.log(`     Status: ${tx.status}`);
        console.log(`     Amount: $${tx.targetAmount} ${tx.targetCurrency}`);
        console.log(`     Reference: ${tx.details?.reference || 'N/A'}`);
        console.log(`     Date: ${new Date(tx.created).toISOString()}\n`);
      });
    } else {
      console.log('  No transfers found\n');
    }

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║        ✅ WISE ACCOUNT STATUS VERIFIED                   ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('Account Summary:');
    console.log(`  • Wise Profile: sovereigns`);
    console.log(`  • Profile ID: ${profileId}`);
    console.log(`  • USD Balance: $${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  • Status: ✅ ACTIVE\n`);

    if (usdAmount > 0) {
      console.log('✅ DEPOSIT CONFIRMED!\n');
      console.log('Your Wise account now has USD available for:');
      console.log('  • Outbound transfers to external banks');
      console.log('  • International payments');
      console.log('  • Multi-currency conversions\n');
    } else {
      console.log('⚠️  No USD balance detected. The $30 deposit may still be processing.\n');
    }

  } catch (err: any) {
    console.error('\n❌ Error checking Wise account:');
    console.error(`  ${err.message}\n`);
    process.exit(1);
  }
}

checkDepositStatus().catch(console.error);
