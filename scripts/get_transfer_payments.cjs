const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const id = process.argv[2];
if(!id){ console.error('Usage: node scripts/get_transfer_payments.cjs <transferId>'); process.exit(2); }
const token = (process.env.WISE_API_TOKEN) || (()=>{ try{ const lines = fs.readFileSync(path.join(__dirname,'../config/.env.credentials'),'utf8').split(/\r?\n/); for(const l of lines){ const m=l.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/); if(m) return m[1].trim(); } }catch(e){} return ''; })();
if(!token){ console.error('WISE_API_TOKEN not found'); process.exit(3); }
(async ()=>{
  const profileId = process.env.WISE_BUSINESS_PROFILE_ID || '101924589';
  const res = await fetch(`https://api.transferwise.com/v3/profiles/${profileId}/transfers/${id}/payments`, { headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' } });
  const txt = await res.text();
  console.log('STATUS', res.status);
  try{ console.log(JSON.parse(txt)); }catch(e){ console.log(txt); }
})();
