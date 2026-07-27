const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const transferId = process.argv[2];
if(!transferId){ console.error('Usage: node scripts/fetch_transfer_instructions.cjs <transferId>'); process.exit(2); }
const token = (process.env.WISE_API_TOKEN) || (()=>{ try{ const lines = fs.readFileSync(path.join(__dirname,'../config/.env.credentials'),'utf8').split(/\r?\n/); for(const l of lines){ const m=l.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/); if(m) return m[1].trim(); } }catch(e){} return ''; })();
if(!token){ console.error('WISE_API_TOKEN not found'); process.exit(3); }

const profileId = process.env.WISE_BUSINESS_PROFILE_ID || '101924589';
const base = 'https://api.transferwise.com';

async function tryGet(path){
  try{
    const res = await fetch(base+path, { headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' } });
    const txt = await res.text();
    return { status: res.status, body: (()=>{ try{ return JSON.parse(txt); }catch(e){ return txt; } })() };
  }catch(e){ return { error: String(e) }; }
}

(async ()=>{
  const results = {};
  results['v1_transfer'] = await tryGet(`/v1/transfers/${transferId}`);
  results['v3_profile_transfer'] = await tryGet(`/v3/profiles/${profileId}/transfers/${transferId}`);
  results['v3_profile_transfer_payments'] = await tryGet(`/v3/profiles/${profileId}/transfers/${transferId}/payments`);
  // payin session id from transfer
  const maybe = results['v1_transfer'];
  let payinSessionId = null;
  if(maybe && maybe.body && maybe.body.payinSessionId) payinSessionId = maybe.body.payinSessionId;
  if(payinSessionId) results['v1_payin_session'] = await tryGet(`/v1/payin-sessions/${payinSessionId}`);

  // Write out to file
  const outPath = path.join(__dirname,`transfer_${transferId}_instructions.json`);
  fs.writeFileSync(outPath, JSON.stringify(results,null,2),'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify(results,null,2));
})();
