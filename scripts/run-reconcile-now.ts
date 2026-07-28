import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Ensure the ledger uses the exact DB file path by setting the env var
process.env.SOVEREIGN_DB_FILE_PATH = path.resolve(process.cwd(), 'src', 'db', 'database.json');

// Import `db` after setting SOVEREIGN_DB_FILE_PATH so ledger picks it up
import { db } from '../src/db/ledger.js';

async function main() {
  const args = process.argv.slice(2);
  const userIdArg = args.find(a => !a.startsWith('--'));
  const userId = userIdArg || process.env.USER_ID || 'user_032fbb1c-6da2-4d5b-816f-0546c1825286';
  const runAll = args.includes('--all');
  const skipTx = args.includes('--no-tx') || !!process.env.NO_TX;

  try {
    const { getWiseTotalCashUSD } = await import('../src/lib/wise-live-integration.js');
    const { buildReconciliationSnapshot } = await import('../src/lib/wise-live-integration.js');

    let apiWiseData: any = null;
    try {
      apiWiseData = await getWiseTotalCashUSD();
    } catch (e: any) {
      console.warn('[RECONCILE] Wise API unavailable for live fetch; will fallback to local WISE_BUSINESS where needed.');
    }

    let targetUserIds: string[] = [];
    if (runAll) {
      const allWallets = db.execute('SELECT * FROM wallets') as any[];
      const usd = allWallets.filter(w => String(w.assetSymbol || '').toUpperCase() === 'USD');
      targetUserIds = Array.from(new Set(usd.map(w => w.userId)));
    } else {
      targetUserIds = [userId];
    }

    for (const uid of targetUserIds) {
      try {
        console.log('[RECONCILE] Processing', uid);

        const usdWallets = db.execute('SELECT * FROM wallets WHERE user_id = ? AND asset_symbol = ?', [uid, 'USD']) as any[];
        const currentAppUsd = usdWallets.length > 0 ? Number(usdWallets[0].balance || 0) : 0;

        // determine wise data for this run
        let wiseData = apiWiseData;
        if (!wiseData || Number(wiseData.totalUSD || 0) === 0) {
          const allWallets = db.execute('SELECT * FROM wallets') as any[];
          const localWise = allWallets.filter(w => String(w.assetSymbol || '').toUpperCase() === 'WISE_BUSINESS');
          const fallbackUsd = localWise.length > 0 ? Number(localWise[0].balance || 0) : 0;
          wiseData = { cadBalance: 0, usdBalance: fallbackUsd, totalUSD: fallbackUsd, cadRate: 1 };
        }

        const currentWiseTotal = Number(wiseData.totalUSD || 0);
        const reconciledBalance = currentAppUsd + currentWiseTotal;

        const reconciliationSnapshot = buildReconciliationSnapshot({
          userId: String(uid),
          walletId: String(usdWallets[0]?.id || `wallet-${uid}-usd`),
          lockedToEmail: 'reconcile-script',
          walletBalanceUsd: reconciledBalance,
          totalReconciledUsdValue: reconciledBalance,
          driftAmount: 0,
          verifiedAt: new Date().toISOString()
        });

        // idempotency: skip if snapshot already exists
        const allTxs = db.execute('SELECT * FROM transactions') as any[];
        const exists = allTxs.some(t => String(t.hash || '').toLowerCase() === String(reconciliationSnapshot.proofHash || '').toLowerCase());
        if (exists) {
          console.log('[RECONCILE] Snapshot already exists for', uid, 'skipping');
          continue;
        }

        if (!skipTx) db.beginTransaction();
        try {
          if (usdWallets.length > 0) {
            db.execute('UPDATE wallets SET balance = ? WHERE user_id = ? AND asset_symbol = ?', [reconciledBalance, uid, 'USD']);
          } else {
            db.execute('INSERT INTO wallets (id, user_id, asset_symbol, balance, public_address_ethereum, public_address_bitcoin, identityLocked, productionMode, blockchainLinked, lockedToEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [`wallet-${uid}-usd`, uid, 'USD', reconciledBalance, '', '', true, 'live', false, 'reconcile-script']);
          }

          const txId = `wise_recon_${crypto.randomUUID()}`;
          const detailsText = `Wise Balance Reconciliation: CAD ${wiseData.cadBalance.toFixed(2)} + USD ${wiseData.usdBalance.toFixed(2)} = USD ${currentWiseTotal.toFixed(2)}`;
          db.execute('INSERT INTO transactions (id, user_id, type, asset_symbol, amount, fiat_amount, timestamp, details, hash, status, ledger_debit, ledger_credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [txId, uid, 'RECONCILE', 'USD', currentWiseTotal, currentWiseTotal, Date.now(), detailsText, txId, 'completed', 'wise_account', 'USD']);

          const snapTxId = `wise_recon_snapshot_${crypto.randomUUID()}`;
          db.execute('INSERT INTO transactions (id, user_id, type, asset_symbol, amount, fiat_amount, timestamp, details, hash, status, ledger_debit, ledger_credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [snapTxId, uid, 'RECONCILIATION_SNAPSHOT', 'USD', 0, 0, Date.now(), JSON.stringify(reconciliationSnapshot), reconciliationSnapshot.proofHash || snapTxId, 'completed', 'reconciliation', 'wise_account']);

          const auditId = `audit_${crypto.randomUUID()}`;
          db.execute('INSERT INTO audit_logs (id, user_id, action, timestamp, ip_address, status, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [auditId, uid, 'WISE_RECONCILE', Date.now(), '127.0.0.1', 'success', JSON.stringify({ wiseData, reconciliationSnapshot })]);

          if (!skipTx) db.commit();
          console.log('[RECONCILE] Success:', { uid, txId, snapTxId, auditId, reconciledBalance });
        } catch (e: any) {
          if (!skipTx) try { db.rollback(); } catch (_) {}
          console.error('[RECONCILE] Failed for', uid, e.message || e);
        }
      } catch (e: any) {
        console.error('[RECONCILE] Unexpected error for', uid, e.message || e);
      }
    }

    await gracefulExit(0);
  } catch (e: any) {
    console.error('[RECONCILE] Fatal error', e.message || e);
    await gracefulExit(3);
  }
}

main();

async function gracefulExit(code = 0) {
  try {
    // Inspect active handles for debugging and attempt to close/destroy common ones.
    const getHandles = (process as any)._getActiveHandles;
    const handles = typeof getHandles === 'function' ? getHandles.call(process) : [];
    try {
      console.log('[EXIT] activeHandles:', handles.length);
      handles.forEach((h: any, idx: number) => {
        try {
          const type = h && h.constructor ? h.constructor.name : typeof h;
          console.log(`[EXIT] handle[${idx}] type=${type}`);
          if (typeof h.close === 'function') {
            try { h.close(); } catch (_) {}
          }
          if (typeof h.destroy === 'function') {
            try { h.destroy(); } catch (_) {}
          }
        } catch (_) {}
      });
    } catch (err) {
      // ignore introspection errors
    }
  } catch (_) {}

  // Allow a short grace period for handles to close cleanly
  await new Promise((resolve) => setTimeout(resolve, 250));
  try { process.exit(code); } catch { /* ensure exit */ }
}
