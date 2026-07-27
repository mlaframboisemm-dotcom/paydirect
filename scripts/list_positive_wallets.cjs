const fs = require('fs');
const dbPath = './src/db/database.json';
const s = fs.readFileSync(dbPath,'utf8');
const db = JSON.parse(s);
const wallets = db.wallets || [];
const positives = wallets.filter(w=>Number(w.balance||0)>0).map(w=>({id:w.id,userId:w.userId,assetSymbol:w.assetSymbol,balance:w.balance,lockedToEmail:w.lockedToEmail}));
console.log(JSON.stringify(positives,null,2));
