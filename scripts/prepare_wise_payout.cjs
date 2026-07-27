const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '../src/db/database.json');
try{
  const s = fs.readFileSync(dbPath,'utf8');
  const db = JSON.parse(s);
  const wallet = db.wallets.find(w=>w.id==='wallet-user_032fbb1c-6da2-4d5b-816f-0546c1825286-usd' || w.userId==='user_032fbb1c-6da2-4d5b-816f-0546c1825286');
  if(!wallet){
    console.error('Wallet not found'); process.exit(2);
  }
  const amount = Number(wallet.balance||0);
  const plan = {
    generatedAt: new Date().toISOString(),
    walletId: wallet.id,
    userId: wallet.userId,
    assetSymbol: wallet.assetSymbol,
    currentBalance: amount,
    currency: 'USD',
    recommendedAction: 'Payout funds from app USD wallet to Wise business profile balance',
    recipientIds: {
      defaultRecipientUsd: Number(process.env.WISE_RECIPIENT_USD_ID||1504691893),
      defaultRecipientCad: Number(process.env.WISE_RECIPIENT_CAD_ID||1504627763),
      businessProfileId: Number(process.env.WISE_BUSINESS_PROFILE_ID||101924589)
    },
    safety: {
      confirmFlag: '--confirm',
      requireEnv: 'ALLOW_LIVE_PAYOUT=true',
      note: 'The execution script `scripts/execute_wise_payout.cjs` will only run when called with both the --confirm flag and ALLOW_LIVE_PAYOUT=true in the environment.'
    },
    executeCommandExamples: {
      dryRun: 'node scripts/execute_wise_payout.cjs --dry-run',
      liveRun: 'ALLOW_LIVE_PAYOUT=true node scripts/execute_wise_payout.cjs --confirm'
    }
  };
  fs.writeFileSync(path.join(__dirname,'payout_plan.json'), JSON.stringify(plan,null,2),'utf8');
  console.log('Prepared payout_plan.json — review before executing.');
  console.log(JSON.stringify(plan,null,2));
}catch(e){console.error('ERR',String(e));process.exit(1);}