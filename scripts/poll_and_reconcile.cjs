#!/usr/bin/env node
// Poll a Wise transfer until funded, then fetch Wise balances and reconcile into local DB.
// Usage: node scripts/poll_and_reconcile.cjs <transferId> [attempts=30] [intervalSec=10]

const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const transferId = process.argv[2];
const attempts = Number(process.argv[3]||30);
const intervalSec = Number(process.argv[4]||10);
if(!transferId){ console.error('Usage: node scripts/poll_and_reconcile.cjs <transferId> [attempts] [intervalSec]'); process.exit(2); }

const token = (process.env.WISE_API_TOKEN) || (()=>{ try{ const lines = fs.readFileSync(path.join(__dirname,'../config/.env.credentials'),'utf8').split(/\r?\n/); for(const l of lines){ const m=l.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/); if(m) return m[1].trim(); } }catch(e){} return ''; })();
if(!token){ console.error('WISE_API_TOKEN not found'); process.exit(3); }

const profileId = Number(process.env.WISE_BUSINESS_PROFILE_ID || 101924589);
const base = 'https://api.transferwise.com';

async function getTransfer(){
  const res = await fetch(`${base}/v1/transfers/${transferId}`, { headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text(); try{ return JSON.parse(txt); }catch(e){ return txt; }
}

async function getBalances(){
  // v4 balances
  const res = await fetch(`${base}/v4/profiles/${profileId}/balances?types=STANDARD`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' } });
  const txt = await res.text(); const arr = JSON.parse(txt);
  return arr.map(b=>({ currency: b.amount?.currency||b.currency, amount: Number(b.amount?.value||0) }));
}

async function getCadRate(){
  try{
    const res = await fetch(`${base}/v1/rates?source=CAD&target=USD`, { headers: { Authorization: `Bearer ${token}` } });
    const txt = await res.text(); const arr = JSON.parse(txt);
    if(Array.isArray(arr) && arr.length>0) return Number(arr[0].rate||1);
  }catch(e){}
  return 1.40895;
}

(async ()=>{
  console.log('Watching transfer', transferId, 'for funding...');
  for(let i=0;i<attempts;i++){
    try{
      const t = await getTransfer();
      const status = t && t.status ? t.status : JSON.stringify(t);
      console.log(new Date().toISOString(), 'attempt', i+1, '/', attempts, 'status=', status);
      if(['incoming_payment_received','funded','paid','completed','incoming_payment_waiting_for_pain','incoming_payment_waiting_for_payin'].includes(String(status)) || (String(status).toLowerCase().includes('received')||String(status).toLowerCase().includes('fund'))){
        console.log('Detected funded status:', status);
        // fetch balances
        const bals = await getBalances();
        const cadRate = await getCadRate();
        let cad=0, usd=0;
        for(const b of bals){ if(b.currency==='CAD') cad+=b.amount; if(b.currency==='USD') usd+=b.amount; }
        const totalUSD = usd + cad * cadRate;
        console.log('Wise balances:', { cad, usd, cadRate, totalUSD });
        // update local DB
        const dbPath = path.join(__dirname,'../src/db/database.json');
        const db = JSON.parse(fs.readFileSync(dbPath,'utf8'));
        const wallet = (db.wallets||[]).find(w=>w.id==='wallet-user_032fbb1c-6da2-4d5b-816f-0546c1825286-usd' || w.userId==='user_032fbb1c-6da2-4d5b-816f-0546c1825286');
        const currentAppUsd = wallet ? Number(wallet.balance||0) : 0;
        const reconciled = currentAppUsd + totalUSD;
        if(wallet){ wallet.balance = reconciled; }
        const txId = `wise_recon_${cryptoRandom()}`;
        db.transactions = db.transactions || [];
        db.transactions.push({ id: txId, userId: 'user_032fbb1c-6da2-4d5b-816f-0546c1825286', type: 'RECONCILE', assetSymbol:'USD', amount: totalUSD, fiatAmount: totalUSD, timestamp: Date.now(), details: `Auto reconcile after transfer ${transferId}`, hash: txId, status: 'completed', ledgerDebit: 'wise_account', ledgerCredit: 'USD' });
        fs.writeFileSync(dbPath, JSON.stringify(db,null,2),'utf8');
        console.log('Local DB reconciled, txId=', txId, 'wallet new balance=', reconciled);
        process.exit(0);
      }
    }catch(e){ console.error('Check failed:', String(e)); }
    await new Promise(r=>setTimeout(r, intervalSec*1000));
  }
  console.log('Polling finished without detecting funding.');
  process.exit(0);
})();

function cryptoRandom(){ return 'r'+Math.random().toString(36).slice(2,10); }
