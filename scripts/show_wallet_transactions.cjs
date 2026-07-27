const fs = require('fs');
const arg = process.argv[2] || '';
const dbPath = './src/db/database.json';
if (!arg) {
  console.error('Usage: node scripts/show_wallet_transactions.cjs <walletId|userId>');
  process.exit(2);
}
try{
  const s = fs.readFileSync(dbPath,'utf8');
  const db = JSON.parse(s);
  const wallets = db.wallets||[];
  const wallet = wallets.find(w=>w.id===arg || w.userId===arg || w.assetSymbol===arg);
  const userId = wallet ? wallet.userId : arg;
  const txs = (db.transactions||[]).filter(t=>t.userId===userId || String(t.ledgerCredit||'').toLowerCase().includes('wise') || String(t.ledgerDebit||'').toLowerCase().includes('wise') || String(t.details||'').toLowerCase().includes('wise') || String(t.id||'').toLowerCase().includes('wise') );
  console.log('WALLET:');
  console.log(JSON.stringify(wallet||{providedArg:arg},null,2));
  console.log('\nTRANSACTIONS ('+txs.length+') :');
  console.log(JSON.stringify(txs,null,2));
}catch(e){console.error('ERR',String(e));process.exit(1);}