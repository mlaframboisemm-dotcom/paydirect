const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const credsPath = path.join(process.cwd(), 'config', '.env.credentials');
let token = process.env.WISE_API_TOKEN;
if (!token && fs.existsSync(credsPath)) {
  const lines = fs.readFileSync(credsPath, 'utf8').split(/\r?\n/);
  for (const l of lines) {
    const m = l.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/);
    if (m) { token = m[1].trim(); break; }
  }
}
if (!token) { console.error('NO_TOKEN'); process.exit(1); }
const profileId = process.env.WISE_BUSINESS_PROFILE_ID || '101924589';
const bases = ['https://api.wise.com', 'https://api.transferwise.com'];
const paths = ['/v4/profiles/' + profileId + '/balances?types=STANDARD', '/v4/profiles/' + profileId + '/balances', '/v3/profiles/' + profileId + '/balances?types=STANDARD', '/v3/profiles/' + profileId + '/balances'];
(async () => {
  for (const base of bases) {
    for (const p of paths) {
      try {
        const url = base.replace(/\/$/, '') + p;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
        const txt = await res.text();
        let body;
        try { body = JSON.parse(txt); } catch (e) { body = txt; }
        console.log('===', url, 'status', res.status);
        console.log(JSON.stringify(body, null, 2));
      } catch (e) {
        console.error('ERROR', base, p, String(e));
      }
    }
  }
})();
