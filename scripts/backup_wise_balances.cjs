const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

const cwd = process.cwd();
const envPath = path.join(cwd, 'config', '.env.credentials');
const backupDir = path.join(cwd, 'backups');

function readEnvToken() {
  if (!fs.existsSync(envPath)) return '';
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/);
    if (match) return match[1].trim();
  }
  return '';
}

const token = process.env.WISE_API_TOKEN || readEnvToken();
if (!token) {
  console.error('WISE_API_TOKEN not configured in environment or config/.env.credentials');
  process.exit(1);
}

const baseUrl = 'https://api.wise.com';
const profileId = process.env.WISE_BUSINESS_PROFILE_ID || '101924589';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `wise-balance-backup-${timestamp}.json`);

async function run() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const url = `${baseUrl}/v4/profiles/${profileId}/balances?types=STANDARD`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const body = await res.text();
  if (!res.ok) {
    console.error('Wise API error', res.status, body);
    process.exit(2);
  }

  const data = JSON.parse(body);
  fs.writeFileSync(backupFile, JSON.stringify({ fetchedAt: new Date().toISOString(), profileId, data }, null, 2), 'utf8');
  console.log(`Saved Wise balance backup to ${backupFile}`);
}

run().catch((err) => {
  console.error('Backup failed', err.stack || err.message || err);
  process.exit(3);
});
