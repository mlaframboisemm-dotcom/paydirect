const fs = require('fs');
const fetch = globalThis.fetch || require('node-fetch');
function parseEnv(path){
  const obj = {};
  try{const s=fs.readFileSync(path,'utf8');for(const line of s.split(/\r?\n/)){const l=line.trim();if(!l||l.startsWith('#'))continue;const m=l.match(/^([^=]+)=(.*)$/);if(m){let val=m[2].trim();if(val.startsWith('"')&&val.endsWith('"'))val=val.slice(1,-1);if(val.startsWith("'")&&val.endsWith("'"))val=val.slice(1,-1);obj[m[1].trim()]=val;}}}catch(e){}
  return obj;
}
(async()=>{
  const local = parseEnv('./.env.local');
  const creds = parseEnv('./config/.env.credentials');
  const env = Object.assign({}, process.env, local, creds);
  const token = env.WISE_API_TOKEN;
  if(!token){console.error('NO_TOKEN');process.exit(2);} 
  const sandbox = String(env.WISE_SANDBOX_MODE||'true').toLowerCase()==='true';
  const base = env.WISE_BASE || (sandbox ? 'https://api.sandbox.wise.com' : 'https://api.wise.com');
  try{
    const res = await fetch(base.replace(/\/$/,'')+'/v1/profiles',{headers:{Authorization:`Bearer ${token}`}});
    const text = await res.text();
    if(!res.ok){console.error('ERR',res.status,text.substring(0,1000));process.exit(3);}    
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  }catch(e){console.error('EX',String(e));process.exit(4);} 
})();
