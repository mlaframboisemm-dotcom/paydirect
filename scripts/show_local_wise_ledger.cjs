const fs = require('fs');
const dbPath = './src/db/database.json';
try{
  const s = fs.readFileSync(dbPath,'utf8');
  const db = JSON.parse(s);
  const wallets = (db.wallets||[]).filter(w=>String(w.assetSymbol||'').toUpperCase().includes('WISE'));
  const txs = (db.transactions||[]).filter(t=>{
    return String(t.type||'').toUpperCase().includes('WISE') || String(t.ledgerCredit||'').toLowerCase().includes('wise') || String(t.ledgerDebit||'').toLowerCase().includes('wise') || String(t.details||'').toLowerCase().includes('wise');
  });
  console.log('WALLETS:');
  console.log(JSON.stringify(wallets,null,2));
  console.log('\nTRANSACTIONS:');
  console.log(JSON.stringify(txs.slice(0,200),null,2));
}catch(e){console.error('ERR',String(e));process.exit(1);}