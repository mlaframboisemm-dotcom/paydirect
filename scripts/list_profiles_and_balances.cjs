const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const token = (process.env.WISE_API_TOKEN) || (()=>{ try{ const lines = fs.readFileSync(path.join(__dirname,'../config/.env.credentials'),'utf8').split(/\r?\n/); for(const l of lines){ const m=l.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/); if(m) return m[1].trim(); } }catch(e){} return ''; })();
if(!token){ console.error('WISE_API_TOKEN not found'); process.exit(2); }
(async ()=>{
  const base = 'https://api.transferwise.com';
  const res = await fetch(base + '/v4/profiles', { headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text();
  let profiles = [];
  try{ profiles = JSON.parse(txt); }catch(e){ console.error(txt); process.exit(3); }
  const out = [];
  const profileList = Array.isArray(profiles) ? profiles : Array.isArray(profiles.profiles) ? profiles.profiles : [];
  for(const p of profileList){
    let balances = [];
    try{
      const r = await fetch(`${base}/v4/profiles/${p.id}/balances?types=STANDARD`, { headers:{ Authorization:`Bearer ${token}` } });
      const t = await r.text(); balances = JSON.parse(t);
    }catch(e){ balances = { error: String(e) }; }
    out.push({ id: p.id, type: p.profileType || p.type, name: p.details?.name || p.type || '', balances });
  }
  const outPath = path.join(__dirname,'wise_profiles_and_balances.json');
  fs.writeFileSync(outPath, JSON.stringify(out,null,2),'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify(out,null,2));
})();
