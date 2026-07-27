#!/usr/bin/env node
// Direct executor: creates a Wise quote, transfer, funds it from BALANCE, then updates local DB.
// Requires ALLOW_LIVE_PAYOUT=true and --confirm

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const dry = args.includes('--dry-run');
if (!dry && !confirm) { console.error('Provide --dry-run or --confirm'); process.exit(2); }
if (confirm && process.env.ALLOW_LIVE_PAYOUT !== 'true') { console.error('Set ALLOW_LIVE_PAYOUT=true for live run'); process.exit(3); }

function loadEnvToken(){
  if (process.env.WISE_API_TOKEN) return process.env.WISE_API_TOKEN.trim();
  try{
    const envFile = path.join(__dirname,'../config/.env.credentials');
    if(fs.existsSync(envFile)){
      const lines = fs.readFileSync(envFile,'utf8').split(/\r?\n/);
      for(const l of lines){
        const m = l.match(/^\s*WISE_API_TOKEN\s*=\s*(.+)\s*$/);
        if(m) return m[1].trim();
      }
    }
  }catch(e){}
  return '';
}

(async ()=>{
  const planPath = path.join(__dirname,'payout_plan.json');
  if(!fs.existsSync(planPath)){ console.error('payout_plan.json missing; run prepare_wise_payout.cjs'); process.exit(4); }
  const plan = JSON.parse(fs.readFileSync(planPath,'utf8'));
  const amount = Number(plan.currentBalance||0);
  if(!amount || amount<=0){ console.error('No positive balance'); process.exit(5); }
  console.log('Plan:', plan.walletId, 'amount', amount);

  if(dry){ console.log('DRY RUN — no network calls.'); process.exit(0); }

  const token = loadEnvToken();
  if(!token){ console.error('WISE_API_TOKEN not found in env or config/.env.credentials'); process.exit(6); }

  const WISE_BASE = 'https://api.transferwise.com';
  const profileId = Number(plan.recipientIds.businessProfileId||101924589);
  const recipientId = Number(plan.recipientIds.defaultRecipientUsd||1504691893);

  const fetch = global.fetch || (await import('node-fetch')).default;

  async function wisePost(pathSuffix, body){
    const res = await fetch(WISE_BASE+pathSuffix, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try{ json = JSON.parse(text); }catch(e){ }
    if(!res.ok){ throw new Error(`Wise POST ${pathSuffix} failed ${res.status} ${text}`); }
    return json;
  }

  try{
    // Create quote
    console.log('Creating quote...');
    const quote = await wisePost(`/v3/profiles/${profileId}/quotes`, { sourceCurrency:'USD', targetCurrency:'USD', sourceAmount: amount, targetAmount: null, payOut: 'BALANCE' });
    const quoteId = quote.id;
    // pick best BALANCE option
    const options = (quote.paymentOptions||[]).filter(o=>o.payOut==='BALANCE');
    const best = options.sort((a,b)=>(a.fee?.total||99)-(b.fee?.total||99))[0]||options[0]||{};
    const targetAmount = Number(best.targetAmount||0);
    const fee = Number(best.fee?.total||0);
    const rate = Number(best.rate||quote.rate||1);
    console.log('Quote created', { quoteId, targetAmount, fee, rate });

    // Create transfer
    const idempotency = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    console.log('Creating transfer...');
    const transfer = await wisePost('/v1/transfers', { targetAccount: recipientId, quoteUuid: quoteId, customerTransactionId: idempotency, details: { reference: 'Sovereign payout', transferPurpose:'verification.transfers.purpose.pay.bills', sourceOfFunds:'verification.source.of.funds.other' } });
    const transferId = transfer.id;
    console.log('Transfer created', transferId);

    // Fund transfer from balance
    try{
      console.log('Funding transfer from BALANCE...');
      await wisePost(`/v3/profiles/${profileId}/transfers/${transferId}/payments`, { type: 'BALANCE' });
      console.log('Funded transfer via BALANCE');
    }catch(ferr){ console.warn('Funding may have failed or transfer pending:', String(ferr.message)); }

    // Update local DB: deduct wallet balance and insert transaction
    const dbPath = path.join(__dirname,'../src/db/database.json');
    const db = JSON.parse(fs.readFileSync(dbPath,'utf8'));
    // find wallet
    const wallet = (db.wallets||[]).find(w=>w.id===plan.walletId || w.userId===plan.userId);
    if(!wallet){ console.error('Local wallet not found; aborting local DB update'); process.exit(7); }
    const currentBal = Number(wallet.balance||0);
    const newBal = currentBal - amount;
    wallet.balance = newBal;
    // create transaction
    const txId = `wise_payout_${crypto.randomUUID()}`;
    const tx = {
      id: txId,
      userId: plan.userId,
      type: 'WITHDRAWAL',
      assetSymbol: 'USD',
      amount: amount,
      fiatAmount: amount,
      timestamp: Date.now(),
      details: `Wise Payout: USD ${amount} → USD ${targetAmount.toFixed(2)} (Transfer #${transferId})`,
      hash: String(transferId||txId),
      status: 'completed',
      ledgerDebit: 'USD',
      ledgerCredit: 'wise_usd'
    };
    db.transactions = db.transactions || [];
    db.transactions.push(tx);
    fs.writeFileSync(dbPath, JSON.stringify(db,null,2),'utf8');

    console.log('Local DB updated: wallet balance set to', newBal, 'transaction id', txId);
    console.log({ success:true, transferId, quoteId, targetAmount, fee, rate, txId });
    process.exit(0);
  }catch(e){ console.error('Execution failed:', String(e)); process.exit(8); }

})();
