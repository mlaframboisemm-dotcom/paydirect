import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';

dotenv.config();

console.log('🚀 Manual Finalization of transaction TXR-BF0978B7...');

const stripeKey = process.env.STRIPE_SECRET_KEY;
const encryptionKey = process.env.SOVEREIGN_ENCRYPTION_KEY || 'default-sovereign-master-key-32chars';
const transferId = 'TXR-BF0978B7';
const userId = 'user_mlaframboisemm';
const amountCad = 500.00;
const defaultUsdCadRate = 1.35;
const amountUsd = Number((amountCad / defaultUsdCadRate).toFixed(2));

if (!stripeKey) {
  console.error('❌ Error: STRIPE_SECRET_KEY is not configured in .env.');
  process.exit(1);
}

// 1. Decrypt Ledger Data Helpers (matches server.ts)
function decryptLedgerData(encrypted: string, encKey: string): any {
  if (encrypted.startsWith('{') || !encrypted.includes(':')) {
    return JSON.parse(encrypted);
  }
  try {
    const [ivHex, cipherHex] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = Buffer.from(encKey.slice(0, 32), 'hex').length === 32
      ? Buffer.from(encKey.slice(0, 32), 'hex')
      : crypto.pbkdf2Sync(encKey, 'sovereign_ledger_salt', 100000, 32, 'sha256');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(cipherHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return JSON.parse(decrypted);
  } catch (err) {
    return JSON.parse(encrypted);
  }
}

function encryptLedgerData(data: any, encKey: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(encKey.slice(0, 32), 'hex').length === 32 
      ? Buffer.from(encKey.slice(0, 32), 'hex')
      : crypto.pbkdf2Sync(encKey, 'sovereign_ledger_salt', 100000, 32, 'sha256');
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    return JSON.stringify(data);
  }
}

function addLedgerEntrySignature(entry: any, encKey: string): any {
  const entryJson = JSON.stringify(entry);
  const signature = crypto.createHmac('sha256', encKey).update(entryJson).digest('hex');
  return { ...entry, _hmacSignature: signature };
}

// 2. Dispatch Stripe Payout
async function executeStripePayout() {
  console.log(`💸 Dispatching Stripe payout of $${amountUsd} USD ($${amountCad} CAD equivalent)...`);
  const form = new URLSearchParams();
  form.set('amount', String(Math.round(amountUsd * 100)));
  form.set('currency', 'usd');
  form.set('metadata[user_id]', userId);
  form.set('metadata[reference]', `Interac withdrawal manual settlement for ${transferId}`);

  const response = await fetch('https://api.stripe.com/v1/payouts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: form.toString()
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Stripe payout API failed: ${bodyText}`);
  }
  const json = JSON.parse(bodyText);
  console.log('✅ Stripe payout successful! Payout ID:', json.id);
  return json;
}

// 3. Update JSON Database File
function updateDatabaseFile(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    console.warn(`⚠️ Warning: Database file ${dbPath} not found.`);
    return;
  }
  console.log(`💾 Updating wallet balance in ${dbPath}...`);
  const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const user = dbData.users.find((u: any) => u.id === userId);
  if (!user) {
    console.error(`❌ User ${userId} not found in ${dbPath}.`);
    return;
  }
  const usdWallet = dbData.wallets.find((w: any) => w.userId === userId && w.assetSymbol === 'USD');
  if (!usdWallet) {
    console.error(`❌ USD Wallet not found for user ${userId} in ${dbPath}.`);
    return;
  }
  const oldBalance = usdWallet.balance;
  usdWallet.balance = Number((oldBalance - amountUsd).toFixed(2));
  fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  console.log(`   Updated balance from $${oldBalance} to $${usdWallet.balance} USD.`);
}

// 4. Update Ledger File
function updateLedgerFile(ledgerPath: string) {
  if (!fs.existsSync(ledgerPath)) {
    console.warn(`⚠️ Warning: Ledger file ${ledgerPath} not found.`);
    return;
  }
  console.log(`📝 Appending signed transaction record to ${ledgerPath}...`);
  const content = fs.readFileSync(ledgerPath, 'utf-8');
  let ledger = decryptLedgerData(content, encryptionKey);
  if (!ledger || !ledger.entries) {
    ledger = { entries: [] };
  }

  const clearinghouseHash = "0x" + crypto.randomBytes(32).toString("hex");
  const newEntryPayload = {
    type: 'transfer',
    status: 'executed',
    payload: {
      action: 'settlement.withdrawal',
      method: 'bank',
      amount: amountUsd,
      currency: 'USD',
      amountCad: amountCad,
      bankName: 'Tangerine',
      userId: userId,
      referenceNotes: `White-Label WITHDRAWAL settled via manual Sovereigns Terminal script.`,
      clearinghouseHash
    },
    result: {
      state: 'reconciled',
      clearedAt: new Date().toISOString()
    }
  };

  let entry = {
    id: 'tx_cb_man_' + Math.random().toString(36).substring(2, 11),
    type: newEntryPayload.type,
    createdAt: new Date().toISOString(),
    status: newEntryPayload.status,
    payload: newEntryPayload.payload,
    result: newEntryPayload.result
  };

  entry = addLedgerEntrySignature(entry, encryptionKey);
  ledger.entries.push(entry);
  fs.writeFileSync(ledgerPath, encryptLedgerData(ledger, encryptionKey));
  console.log(`   Ledger entry recorded and signed.`);
}

// 5. Update SQLite Audit Database
function updateSqliteDatabase(sqlitePath: string) {
  if (!fs.existsSync(sqlitePath)) {
    console.warn(`⚠️ Warning: SQLite audit database ${sqlitePath} not found.`);
    return;
  }
  console.log(`🗄️ Inserting audit trailing row into SQLite db ${sqlitePath}...`);
  const db = new sqlite3.Database(sqlitePath);
  const clearinghouseHash = "0x" + crypto.randomBytes(32).toString("hex");
  db.run(
    "INSERT INTO settled_clearinghouse VALUES (?, ?, ?, ?);",
    [
      clearinghouseHash,
      new Date().toISOString(),
      `White-Label WITHDRAWAL cleared manually via Tangerine Bank.`,
      `-$${amountCad.toFixed(2)} CAD`
    ],
    (err) => {
      if (err) {
        console.error("❌ Failed to insert into SQLite:", err.message);
      } else {
        console.log("   SQLite audit trail written successfully.");
      }
      db.close();
    }
  );
}

async function main() {
  try {
    // A. Execute payout on Stripe
    await executeStripePayout();

    // B. Update databases and ledgers in BOTH repositories
    const rootDir3 = path.resolve(__dirname, '..');
    const rootDir55 = path.resolve(rootDir3, '../coinbase55');

    // Update coinbase3
    updateDatabaseFile(path.join(rootDir3, 'src', 'db', 'database.json'));
    updateLedgerFile(path.join(rootDir3, 'ledger_db.json'));
    updateSqliteDatabase(path.join(rootDir3, 'sovereigns_interbank_vault.db'));

    // Update coinbase55
    updateDatabaseFile(path.join(rootDir55, 'src', 'db', 'database.json'));
    updateLedgerFile(path.join(rootDir55, 'ledger_db.json'));
    updateSqliteDatabase(path.join(rootDir55, 'sovereigns_interbank_vault.db'));

    console.log('🎉 Manual settlement execution completed successfully!');
  } catch (err: any) {
    console.error('❌ Manual settlement execution failed:', err.message);
    process.exit(1);
  }
}

main();
