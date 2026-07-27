import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), 'config', '.env.credentials');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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
}

const token = String(env.WISE_API_TOKEN || process.env.WISE_API_TOKEN || '').trim();
const sandbox = String(env.WISE_SANDBOX_MODE || process.env.WISE_SANDBOX_MODE || 'false').toLowerCase() === 'true';
const base = sandbox ? 'https://api.sandbox.wise.com' : 'https://api.wise.com';

if (!token) {
  console.error('Missing WISE_API_TOKEN');
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

async function main() {
  console.log('base', base);
  const profileRes = await fetchJson(`${base}/v1/profiles`);
  console.log('profiles status', profileRes.status);
  if (!profileRes.json) {
    console.log('profiles text', profileRes.text);
    process.exit(1);
  }
  const profiles = Array.isArray(profileRes.json)
    ? profileRes.json
    : Array.isArray(profileRes.json.profiles)
      ? profileRes.json.profiles
      : [];
  console.log('profiles found', profiles.length);
  for (const profile of profiles) {
    console.log('\nprofile', profile.id, profile.type, profile.profileType || '', profile.details?.name || profile.details?.firstName || profile.details?.legalName || '');
    for (const suffix of ['', '?types=STANDARD']) {
      const url = `${base}/v4/profiles/${profile.id}/balances${suffix}`;
      const balanceRes = await fetchJson(url);
      console.log('  url', url);
      console.log('  status', balanceRes.status);
      console.log('  body', JSON.stringify(balanceRes.json || balanceRes.text, null, 2).slice(0, 2000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});