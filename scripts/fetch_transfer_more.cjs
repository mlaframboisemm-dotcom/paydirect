const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const transferId = process.argv[2];
if(!transferId){ console.error('Usage: node scripts/fetch_transfer_more.cjs <transferId>'); process.exit(2); }
const token = (process.env.WISE_API_TOKEN) || (()=>{ try{ const lines = fs.readFileSync(path.join(__dirname,'../config/.env.credentials'),'utf8').split(/\r?\n/); for(const l of lines){ const m=l.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/); if(m) return m[1].trim(); } }catch(e){} return ''; })();
if(!token){ console.error('WISE_API_TOKEN not found'); process.exit(3); }
const profileId = process.env.WISE_BUSINESS_PROFILE_ID || '101924589';
const base = 'https://api.transferwise.com';
const endpoints = [
  `/v3/profiles/${profileId}/transfers/${transferId}/receipts`,
  `/v3/profiles/${profileId}/transfers/${transferId}/available-receipts`,
  `/v3/profiles/${profileId}/transfers/${transferId}/deposit-details`,
  `/v3/profiles/${profileId}/transfers/${transferId}/payins`,
  `/v1/transfers/${transferId}/payins`,
  `/v1/transfers/${transferId}/payments`,
  `/v1/transfers/${transferId}/payouts`,
  `/v3/profiles/${profileId}/transfers/${transferId}/instructions`
];

async function tryGet(path){
  try{
    const res = await fetch(base+path, { headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' } });
    const txt = await res.text();
    try{ return { path, status: res.status, body: JSON.parse(txt) }; }catch(e){ return { path, status: res.status, body: txt }; }
  }catch(e){ return { path, error: String(e) }; }
}

(async ()=>{
  const results = [];
  for(const ep of endpoints){
    const r = await tryGet(ep);
    results.push(r);
  }
  const out = path.join(__dirname,`transfer_${transferId}_more_instructions.json`);
  fs.writeFileSync(out, JSON.stringify(results,null,2),'utf8');
  console.log('Wrote', out);
  console.log(JSON.stringify(results,null,2));
})();
