import fs from 'fs';
import path from 'path';

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let key = m[1].trim();
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const credentialsPath = path.join(process.cwd(), 'config', '.env.credentials');
const env = loadEnv(credentialsPath);
const token = String(env.WISE_API_TOKEN || process.env.WISE_API_TOKEN || '').trim();
if (!token) {
  console.error('Missing WISE_API_TOKEN');
  process.exit(1);
}
const base = 'https://api.wise.com';
const profileId = 101924589;
const typeQueries = [
  'STANDARD',
  'BALANCE',
  'STANDARD,INVESTMENT',
  'CASH',
  'STANDARD,CASH',
  'STANDARD,RESERVED',
  'STANDARD,EXTERNAL',
  'INVESTMENT',
  'ALL',
  'DEFAULT',
  'STANDARD%2CINVESTMENT',
  'STANDARD%2CCASH'
];

async function request(path) {
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, path };
}

(async () => {
  for (const q of typeQueries) {
    const path = `/v4/profiles/${profileId}/balances?types=${q}`;
    const result = await request(path);
    console.log('QUERY', q, 'STATUS', result.status);
    if (Array.isArray(result.json)) {
      console.log('  items', result.json.length);
      console.log(JSON.stringify(result.json.map((b) => ({ currency: b.currency, amount: b.amount?.value, cash: b.cashAmount?.value, totalWorth: b.totalWorth?.value, type: b.type })), null, 2));
    } else {
      console.log('  body', result.text.slice(0, 2000));
    }
    console.log('---');
  }
})();
