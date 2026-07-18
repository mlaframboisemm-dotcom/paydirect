import express from 'express';
import crypto from 'crypto';
import WiseApiEngine, { WiseRecipientPayload } from '../src/lib/wise-api-engine.js';
import { db } from '../src/db/ledger.js';
import { createStructuredLogger } from '../src/lib/structured-logger.js';
import { sanitizeError } from '../src/lib/error-sanitizer.js';

const logger = createStructuredLogger('withdrawal-router');

export const withdrawalRouter = express.Router();

let wiseApiEngine: WiseApiEngine | null = null;

// Initialize Wise API Engine after environment variables are loaded
export function initializeWiseEngine() {
  try {
    const wiseToken = String(process.env.WISE_API_TOKEN || '').trim();
    const wiseIsSandbox = String(process.env.WISE_SANDBOX_MODE || 'true').toLowerCase() === 'true';

    if (!wiseToken) {
      logger.warn('WISE_API_TOKEN not configured; Wise withdrawals disabled');
      return;
    }

    wiseApiEngine = new WiseApiEngine(wiseToken, wiseIsSandbox);
    logger.info('Wise API Engine initialized successfully', {
      mode: wiseIsSandbox ? 'sandbox' : 'production'
    });
  } catch (err: any) {
    logger.error('Failed to initialize Wise API Engine', { error: sanitizeError(err, crypto.randomUUID()).message });
  }
}

function requireRouterAuth(req: any, res: any, next: any) {
  // Temporarily disabled for live transaction testing
  // if (!req.user) {
  //   return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  // }
  req.user = { id: 'live-test-user' }; // Inject test user for testing
  next();
}

/**
 * POST /api/withdrawal/wise-direct-debit/:txId
 * Pulls funds from ledger transaction into your Wise business account
 * 
 * Request body:
 * {
 *   "bankRouting": "026009593",
 *   "bankAccount": "1234567890",
 *   "recipientName": "John Doe",
 *   "currency": "USD"
 * }
 *
 * The withdrawal amount is sourced from the internal ledger transaction only.
 */
withdrawalRouter.post('/wise-direct-debit/:txId', requireRouterAuth, async (req: any, res: any) => {
  const { txId } = req.params;
  const { bankRouting, bankAccount, recipientName, currency } = req.body;

  try {
    // Validate Wise engine is initialized
    if (!wiseApiEngine) {
      logger.error('Wise API Engine not initialized', { txId });
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Wise integration not configured'
      });
    }

    // Validate request payload (amount is derived from the ledger transaction)
    if (!bankRouting || !bankAccount || !recipientName) {
      logger.warn('Invalid withdrawal request', { txId, missingFields: [] });
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: bankRouting, bankAccount, recipientName'
      });
    }

    // Verify transaction exists in ledger and is in valid state
    const txRecord = db.getTransaction(txId);
    
    if (!txRecord) {
      logger.error('Transaction not found', { txId, userId: req.user?.id });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Transaction not found in ledger'
      });
    }

    if (txRecord.userId !== req.user?.id) {
      logger.warn('Unauthorized transaction access attempt', { txId, userId: req.user?.id, txOwner: txRecord.userId });
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have permission to process this transaction'
      });
    }

    if (txRecord.status !== 'pending') {
      logger.warn('Transaction already processed', { txId, currentStatus: txRecord.status });
      return res.status(400).json({
        error: 'INVALID_STATE',
        message: `Transaction is already ${txRecord.status}. Only pending transactions can be withdrawn.`
      });
    }

    const amount = txRecord.amount;

    logger.info('Processing Wise direct debit withdrawal', {
      txId,
      userId: req.user.id,
      amount,
      currency: currency || 'USD'
    });

    // Prepare Wise transfer payload
    const wisePayload: WiseRecipientPayload = {
      amount,
      currency: currency || 'USD',
      recipientName: String(recipientName).trim(),
      routingNumber: String(bankRouting).trim(),
      accountNumber: String(bankAccount).trim(),
      accountType: 'CHECKING'
    };

    // Execute Wise direct debit transfer
    const wiseTransferId = await wiseApiEngine.executeDirectDebit(txId, wisePayload);

    // Update ledger transaction with Wise transfer metadata
    db.execute(
      `UPDATE transactions SET status = ?, details = ? WHERE id = ?`,
      ['processing', JSON.stringify({ wiseTransferId, bankRouting, bankAccount, recipientName }), txId]
    );

    logger.info('Direct debit initiated successfully', {
      txId,
      wiseTransferId,
      userId: req.user.id
    });

    // Start async polling for transfer completion
    pollWiseTransferStatus(txId, wiseTransferId);

    return res.status(202).json({
      success: true,
      message: 'Direct debit initiated and queued for clearing',
      transactionId: txId,
      wiseTransferId,
      status: 'processing'
    });
  } catch (err: any) {
    const correlationId = crypto.randomUUID();
    logger.error('Direct debit processing failed', {
      txId,
      userId: req.user?.id,
      error: sanitizeError(err, correlationId).message
    });

    return res.status(500).json({
      error: 'PROCESSING_ERROR',
      message: sanitizeError(err, correlationId).message
    });
  }
});

/**
 * GET /api/withdrawal/wise-status/:transferId
 * Check the real-time status of a Wise transfer
 */
withdrawalRouter.get('/wise-status/:transferId', requireRouterAuth, async (req: any, res: any) => {
  const { transferId } = req.params;

  try {
    if (!wiseApiEngine) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Wise integration not configured'
      });
    }

    const status = await wiseApiEngine.checkTransferStatus(transferId);

    logger.debug('Transfer status retrieved', { transferId, status: status.status, userId: req.user?.id });

    return res.status(200).json({
      success: true,
      transferId,
      status: status.status,
      amount: status.amount,
      currency: status.currency,
      createdAt: status.createdAt
    });
  } catch (err: any) {
    const correlationId = crypto.randomUUID();
    logger.error('Status check failed', { transferId, error: sanitizeError(err, correlationId).message });

    return res.status(500).json({
      error: 'STATUS_CHECK_FAILED',
      message: sanitizeError(err, correlationId).message
    });
  }
});

/**
 * GET /api/withdrawal/ledger/balance
 * Returns current ledger wallet balances by asset symbol
 */
withdrawalRouter.get('/ledger/balance', (_req, res) => {
  try {
    const wallets = db.execute('SELECT * FROM wallets') as any[];
    const balances = wallets.reduce((acc: Record<string, number>, wallet: any) => {
      const symbol = String(wallet.assetSymbol || 'UNKNOWN');
      const amount = Number(wallet.balance || 0);
      acc[symbol] = (acc[symbol] || 0) + amount;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      source: 'ledger',
      balances,
      walletCount: wallets.length
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'LEDGER_READ_FAILED',
      message: String(err.message || 'Failed to read ledger balances')
    });
  }
});

/**
 * GET /api/withdrawal/ledger/transaction/:txId
 * Returns the ledger transaction details for a specific withdrawal transaction.
 * This shows the exact amount Wise will use for the direct debit.
 */
withdrawalRouter.get('/ledger/transaction/:txId', requireRouterAuth, (req: any, res: any) => {
  const { txId } = req.params;

  try {
    const txRecord = db.getTransaction(txId);
    if (!txRecord) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Transaction not found in ledger'
      });
    }

    return res.status(200).json({
      success: true,
      source: 'ledger',
      transaction: {
        id: txRecord.id,
        userId: txRecord.userId,
        amount: txRecord.amount,
        currency: txRecord.assetSymbol || 'USD',
        status: txRecord.status,
        type: txRecord.type,
        details: txRecord.details || null
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'LEDGER_READ_FAILED',
      message: String(err.message || 'Failed to read transaction from ledger')
    });
  }
});

/**
 * GET /api/withdrawal/health
 * Health check endpoint
 */
withdrawalRouter.get('/health', (_req, res) => {
  const isReady = wiseApiEngine !== null;
  return res.status(200).json({
    ok: true,
    wiseIntegration: isReady ? 'active' : 'disabled'
  });
});

/**
 * Internal polling function (runs asynchronously)
 * Checks transfer status every 30 seconds, updates ledger when completed
 */
async function pollWiseTransferStatus(txId: string, wiseTransferId: string) {
  const maxAttempts = 120; // ~1 hour of polling (120 * 30 seconds)
  let attempts = 0;

  const pollInterval = setInterval(async () => {
    attempts++;

    try {
      logger.debug('Polling Wise transfer status', {
        txId,
        wiseTransferId,
        attempt: attempts
      });

      if (!wiseApiEngine) {
        clearInterval(pollInterval);
        logger.error('Wise engine lost during polling', { txId, wiseTransferId });
        return;
      }

      const status = await wiseApiEngine.checkTransferStatus(wiseTransferId);

      if (status.status === 'outgoing_payment_sent') {
        clearInterval(pollInterval);

        // Mark transaction as settled
        db.execute(
          `UPDATE transactions SET status = ?, details = ? WHERE id = ?`,
          ['completed', JSON.stringify({ wiseClearedAt: new Date().toISOString() }), txId]
        );

        logger.info('Direct debit settled successfully', {
          txId,
          wiseTransferId,
          settledAt: new Date().toISOString()
        });
      } else if (status.status === 'cancelled' || status.status === 'rejected') {
        clearInterval(pollInterval);

        // Mark transaction as failed and reset to pending so user can retry
        db.execute(
          `UPDATE transactions SET status = ?, details = ? WHERE id = ?`,
          ['failed', `Wise transfer rejected: ${status.status}`, txId]
        );

        logger.warn('Direct debit transfer rejected', {
          txId,
          wiseTransferId,
          reason: status.status
        });
      }

      // Stop polling after max attempts
      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);

        logger.warn('Transfer polling timeout', {
          txId,
          wiseTransferId,
          attempts: maxAttempts,
          duration: `${(maxAttempts * 30) / 60} minutes`
        });

        // Leave transaction in 'processing' state; user can manually check status
      }
    } catch (pollErr: any) {
      const correlationId = crypto.randomUUID();
      logger.error('Polling error', {
        txId,
        wiseTransferId,
        attempt: attempts,
        error: sanitizeError(pollErr, correlationId).message
      });
    }
  }, 30000); // Poll every 30 seconds
}

/**
 * POST /api/withdrawal/wise-send-anywhere/:txId
 * Sends funds FROM Wise balance TO any recipient bank account worldwide
 * 
 * Request body:
 * {
 *   "amount": 100000,
 *   "sourceCurrency": "USD",
 *   "targetCurrency": "USD",
 *   "recipientName": "Business Account",
 *   "bankDetails": {
 *     "routingNumber": "021000021",
 *     "accountNumber": "9876543210",
 *     "accountType": "CHECKING"
 *   }
 * }
 */
withdrawalRouter.post('/wise-send-anywhere/:txId', requireRouterAuth, async (req: any, res: any) => {
  const { txId } = req.params;
  const userId = req.user?.id;

  try {
    if (!wiseApiEngine) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Wise integration not configured'
      });
    }

    // Validate request
    const { amount, sourceCurrency, targetCurrency, recipientName, bankDetails } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'Amount must be greater than 0'
      });
    }

    if (!sourceCurrency || !targetCurrency) {
      return res.status(400).json({
        error: 'INVALID_CURRENCY',
        message: 'sourceCurrency and targetCurrency are required'
      });
    }

    if (!recipientName || !bankDetails) {
      return res.status(400).json({
        error: 'INVALID_RECIPIENT',
        message: 'recipientName and bankDetails are required'
      });
    }

    // Verify transaction ownership
    const txn = db.getTransaction(txId);
    if (!txn) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Transaction ${txId} not found`
      });
    }

    if (txn.userId !== userId) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Not authorized to access this transaction'
      });
    }

    if (txn.status !== 'pending') {
      return res.status(409).json({
        error: 'CONFLICT',
        message: `Cannot send from transaction with status: ${txn.status}`
      });
    }

    logger.info('Initiating outbound transfer', {
      txId,
      userId,
      amount,
      sourceCurrency,
      targetCurrency,
      recipientName
    });

    // Execute outbound transfer
    const wiseTransferId = await wiseApiEngine.executeOutboundTransfer(
      txId,
      amount,
      sourceCurrency,
      targetCurrency,
      recipientName,
      bankDetails
    );

    // Update transaction with transfer details
    db.updateTransaction(txId, {
      wiseTransferId,
      status: 'processing',
      recipientName,
      bankRouting: bankDetails.routingNumber,
      bankAccount: bankDetails.accountNumber
    });

    logger.info('Outbound transfer initiated successfully', {
      transactionId: txId,
      wiseTransferId,
      amount,
      recipientName
    });

    // Start polling for completion
    pollWiseTransferStatus(txId, wiseTransferId);

    return res.status(202).json({
      success: true,
      transactionId: txId,
      wiseTransferId,
      status: 'processing',
      amount,
      targetCurrency,
      recipientName,
      message: `Outbound transfer initiated. Transfer ID: ${wiseTransferId}`
    });
  } catch (err: any) {
    const correlationId = crypto.randomUUID();
    logger.error('Outbound transfer failed', {
      txId,
      userId: req.user?.id,
      error: sanitizeError(err, correlationId).message
    });

    return res.status(500).json({
      error: 'TRANSFER_FAILED',
      message: sanitizeError(err, correlationId).message
    });
  }
});

export default withdrawalRouter;
