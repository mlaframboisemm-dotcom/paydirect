const fs = require('fs');
const fetch = globalThis.fetch || require('node-fetch');

function parseEnv(path){
  const obj = {};
  try{
    const s = fs.readFileSync(path, 'utf8');
    for(const line of s.split(/\r?\n/)){
      const l = line.trim();
      if(!l || l.startsWith('#')) continue;
      const m = l.match(/^([^=]+)=(.*)$/);
      if(m){
        let val = m[2].trim();
        if(val.startsWith('"') && val.endsWith('"')) val = val.slice(1,-1);
        if(val.startsWith("'") && val.endsWith("'")) val = val.slice(1,-1);
        obj[m[1].trim()] = val;
      }
    }
  }catch(e){ }
  return obj;
}

(async function(){
  const local = parseEnv('./.env.local');
  const env = Object.assign({}, process.env, local);
  const token = env.WISE_API_TOKEN;
  if(!token){
    console.error('NO_TOKEN');
    process.exit(2);
  }
  const sandbox = String(env.WISE_SANDBOX_MODE || 'true').toLowerCase() === 'true';
  const businessId = env.WISE_BUSINESS_PROFILE_ID || env.WISE_BUSINESS_PROFILE || '101924589';
  const base = env.WISE_BASE || (sandbox ? 'https://api.sandbox.wise.com' : 'https://api.transferwise.com');

  try{
    const url = `${base.replace(/\/$/, '')}/v4/profiles/${businessId}/balances?types=STANDARD`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const text = await res.text();
    if(!res.ok){
      console.error('ERR', res.status, text.substring(0,1000));
      process.exit(3);
    }
    const json = JSON.parse(text);
    // Summarize balances by currency
    const summary = {};
    for(const b of json){
      let currency = 'UNKNOWN';
      let amount = 0;
      if(b.amount && (b.amount.currency || b.currency)){
        currency = b.amount.currency || b.currency;
        amount = Number(b.amount.value || 0);
      } else if(b.currency){
        currency = b.currency;
        amount = Number(b.value || 0);
      }
      if(!Number.isFinite(amount)) amount = 0;
      summary[currency] = (summary[currency] || 0) + amount;
    }
    console.log(JSON.stringify({ profileId: businessId, base, summary }, null, 2));
  }catch(e){
    console.error('EX', String(e));
    process.exit(4);
  }
})();
