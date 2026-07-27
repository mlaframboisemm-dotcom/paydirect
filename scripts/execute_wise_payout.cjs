#!/usr/bin/env node
// Guarded script to execute a live Wise payout. Requires explicit confirmation and ALLOW_LIVE_PAYOUT env var.
// Usage:
//   Dry run: node scripts/execute_wise_payout.cjs --dry-run
//   Live run: ALLOW_LIVE_PAYOUT=true node scripts/execute_wise_payout.cjs --confirm

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const confirm = args.includes('--confirm');
if (!dry && !confirm) {
  console.error('ERROR: must provide --dry-run or --confirm');
  process.exit(2);
}
if (confirm && process.env.ALLOW_LIVE_PAYOUT !== 'true') {
  console.error('ERROR: live execution requires ALLOW_LIVE_PAYOUT=true in environment');
  process.exit(3);
}

(async ()=>{
  const fs = require('fs');
  const path = require('path');
  const planPath = path.join(__dirname,'payout_plan.json');
  if(!fs.existsSync(planPath)){
    console.error('payout_plan.json not found — run prepare_wise_payout.cjs first'); process.exit(4);
  }
  const plan = JSON.parse(fs.readFileSync(planPath,'utf8'));
  const amount = Number(plan.currentBalance || 0);
  if(!amount || amount <= 0){
    console.error('No positive balance to payout'); process.exit(5);
  }

  console.log('Payout plan summary:');
  console.log(JSON.stringify(plan,null,2));

  if(dry){
    console.log('\nDRY RUN: no network calls will be made. To execute live, run:');
    console.log(`ALLOW_LIVE_PAYOUT=true node scripts/execute_wise_payout.cjs --confirm`);
    process.exit(0);
  }

  // Live execution path
  try{
    const { executeWisePayout } = await import('../src/lib/wise-live-integration.js');
    const recipientId = plan.recipientIds.defaultRecipientUsd;
    console.log('Calling Wise to create transfer and fund from app balance...');
    const result = await executeWisePayout({ sourceCurrency: 'USD', targetCurrency: 'USD', sourceAmount: amount, recipientId, reference: 'App payout to Wise business balance' });
    if(result.success){
      console.log('Wise payout executed:', result);
      // Note: the server-side ledger update (app wallet deduction, transaction insertion) is normally handled by server endpoints.
      // This script performs the external Wise transfer only. You may want to run server reconciliation or update local DB after success.
      process.exit(0);
    } else {
      console.error('Wise payout failed:', result.error || result);
      process.exit(6);
    }
  }catch(e){
    console.error('Execution error:', String(e)); process.exit(7);
  }
})();
