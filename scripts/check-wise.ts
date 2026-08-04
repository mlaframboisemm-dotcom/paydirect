import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const localEnvPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
} else {
  dotenv.config();
}

async function checkWise() {
  const token = (process.env.WISE_API_TOKEN || '').trim();
  if (!token) {
    console.log("WISE_API_TOKEN not configured.");
    return;
  }
  
  console.log("Querying Wise live balances...");
  try {
    const { getWiseTotalCashUSD } = await import('../src/lib/wise-live-integration.js');
    const data = await getWiseTotalCashUSD();
    console.log("Wise live data:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error("Wise query failed:", err.message || err);
  }
}

checkWise().catch(console.error);
