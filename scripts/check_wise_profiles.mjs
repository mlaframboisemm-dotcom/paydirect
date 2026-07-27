import fs from 'fs';
import path from 'path';

function readEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

const configPath = path.join(process.cwd(), 'config', '.env.credentials');
const env = readEnvFile(configPath);
const token = String(env.WISE_API_TOKEN || process.env.WISE_API_TOKEN || '').trim();
const sandbox = String(env.WISE_SANDBOX_MODE || process.env.WISE_SANDBOX_MODE || 'false').toLowerCase() === 'true';
const baseUrls = ['https://api.wise.com', 'https://api.transferwise.com'];

console.log('token present:', Boolean(token));
console.log('sandbox mode:', sandbox);
console.log('profile override ids:', env.WISE_BUSINESS_PROFILE_ID, env.WISE_PERSONAL_PROFILE_ID);

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
  return { status: res.status, text, json: safeParse(text) };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

for (const base of baseUrls) {
  try {
    const result = await fetchJson(`${base}/v1/profiles`);
    console.log('\n===', base, '===');
    console.log('status:', result.status);
    console.log('text:', result.text.slice(0, 1600));
    if (result.json) {
      console.log('profiles count:', Array.isArray(result.json) ? result.json.length : 'n/a');
      if (Array.isArray(result.json)) {
        for (const p of result.json) {
          console.log('profile:', p.id, p.type, p.profileType, p.details?.name || p.details?.legalName || '');
        }
      } else if (Array.isArray(result.json.profiles)) {
        console.log('profiles array count:', result.json.profiles.length);
        for (const p of result.json.profiles) {
          console.log('profile:', p.id, p.type, p.profileType, p.details?.name || p.details?.legalName || '');
        }
      }
    }
  } catch (error) {
    console.error('fetch failed for', base, error);
  }
}
