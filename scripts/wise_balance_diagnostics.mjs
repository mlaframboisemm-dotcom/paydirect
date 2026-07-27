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
const sandbox = String(env.WISE_SANDBOX_MODE || process.env.WISE_SANDBOX_MODE || 'false').toLowerCase() === 'true';
const base = String(env.WISE_BASE_URL || env.WISE_BASE || (sandbox ? 'https://api.sandbox.wise.com' : 'https://api.wise.com')).replace(/\/$/, '');

if (!token) {
  console.error('Missing WISE_API_TOKEN in config/.env.credentials or environment');
  process.exit(1);
}

async function request(method, path, body = undefined) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, text, json, url };
}

function formatBalance(balance) {
  if (!balance || typeof balance !== 'object') return String(balance);
  const currency = String(balance.currency || balance.amount?.currency || balance.type || 'UNKNOWN');
  const amount = Number(balance.amount?.value ?? balance.cashAmount?.value ?? balance.totalWorth?.value ?? balance.amount ?? 0);
  const reserved = Number(balance.reservedAmount?.value ?? 0);
  const cash = Number(balance.cashAmount?.value ?? 0);
  return `${currency}:${amount.toFixed(2)} cash=${cash.toFixed(2)} reserved=${reserved.toFixed(2)}`;
}

function summarizeBalances(balances) {
  if (!Array.isArray(balances)) return 'not-array';
  return balances.map((b) => `(${formatBalance(b)})`).join(', ');
}

function formatAccount(account) {
  if (!account || typeof account !== 'object') return String(account);
  const balanceValue = Number(account.balance?.value ?? account.balance ?? 0);
  return `${account.id} ${account.type} ${account.currency || ''} balance=${balanceValue.toFixed(2)} recipientId=${account.recipientId ?? account.id}`;
}

(async () => {
  console.log('base:', base);
  console.log('sandbox:', sandbox);

  const profilesRes = await request('GET', '/v1/profiles');
  console.log('\n/profiles status', profilesRes.status);
  if (!profilesRes.ok) {
    console.error('profiles error', profilesRes.text);
    process.exit(1);
  }

  const profiles = Array.isArray(profilesRes.json) ? profilesRes.json : [];
  console.log('profiles count', profiles.length);
  for (const profile of profiles) {
    const profileId = Number(profile.id || profile.profileId || 0);
    console.log('\nPROFILE', profileId, profile.type, profile.profileType || '', profile.details?.name || profile.details?.legalName || profile.details?.firstName || '');

    const balancesRes = await request('GET', `/v4/profiles/${profileId}/balances?types=STANDARD`);
    console.log('  /v4/profiles/{id}/balances?types=STANDARD status', balancesRes.status);
    console.log('  balances summary', summarizeBalances(balancesRes.json));
    console.log('  balances raw', JSON.stringify(balancesRes.json, null, 2).slice(0, 16000));
    if (!balancesRes.ok) console.log('  balances body', balancesRes.text);

    const accountsRes = await request('GET', `/v1/accounts?profile=${profileId}`);
    console.log('  /v1/accounts?profile status', accountsRes.status);
    if (accountsRes.ok && Array.isArray(accountsRes.json)) {
      console.log('  accounts count', accountsRes.json.length);
      console.log('  accounts raw', JSON.stringify(accountsRes.json, null, 2).slice(0, 16000));
      for (const account of accountsRes.json) {
        console.log(
          '   - account',
          account.id,
          account.type,
          account.currency,
          'balance=' + (account.balance?.value ?? account.balance ?? 'n/a'),
          account.details?.legalEntityName || account.profileType || account.details?.name || ''
        );
      }
    } else {
      console.log('  accounts body', accountsRes.text);
    }

    const transfersRes = await request('GET', `/v1/transfers?profile=${profileId}&limit=15`);
    console.log('  /v1/transfers?profile status', transfersRes.status);
    if (transfersRes.ok && Array.isArray(transfersRes.json)) {
      console.log('  transfers count', transfersRes.json.length);
      for (const tx of transfersRes.json.slice(0, 5)) {
        console.log('   -', tx.id, tx.status, tx.targetCurrency || tx.sourceCurrency, tx.amount || tx.targetAmount || '', tx.details?.reference || tx.reference || '');
      }
    } else {
      console.log('  transfers body', transfersRes.text);
    }
  }

  process.exit(0);
})();
