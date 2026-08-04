import { getWiseTotalCashUSD } from './wise-live-integration.js';
import { syncAllStripeBalances, GLOBAL_STRIPE_BALANCE } from './stripe-sync.js';
import { generateSovereignWalletPassJWT, getAddToWalletUrl, generatePassQRCode } from './google-wallet-pass.js';
import { db } from '../db/ledger.js';
import { createStructuredLogger } from './structured-logger.js';

const logger = createStructuredLogger('live-provider-bridge');

export interface LiveIntegrationSnapshot {
  success: boolean;
  source: 'live' | 'fallback';
  wise: {
    totalUSD: number;
    cadBalance: number;
    usdBalance: number;
    cadRate: number;
    balances: Array<{ currency: string; amount: number; accountNumber?: string; profileId?: number; type?: string }>;
    accountNumber?: string;
    routingNumber?: string;
    bankName?: string;
    profileId?: number;
    businessName?: string;
  };
  stripe: {
    available: number;
    pending: number;
    total: number;
    lastUpdated: string;
  };
  walletPass: {
    addToWalletUrl: string;
    qrDataUrl: string;
    passJwt: string;
  };
  treasury: {
    totalBalanceUsd: number;
    ledgerBalanceUsd: number;
    availableBalanceUsd: number;
  };
}

export async function buildLiveIntegrationSnapshot(user: { id: string; email: string; name: string }, portfolioUsd = 0): Promise<LiveIntegrationSnapshot> {
  try {
    const wise = await getWiseTotalCashUSD();
    await syncAllStripeBalances();

    const walletBalance = Number(db.execute('SELECT balance FROM wallets WHERE user_id = ? AND asset_symbol = ? LIMIT 1', [user.id, 'USD'])[0]?.balance || 0);
    const ledgerBalance = Number(db.execute('SELECT SUM(fiat_amount) as total FROM transactions WHERE user_id = ? AND status = ?', [user.id, 'completed'])[0]?.total || 0);

    const passData = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      usdBalance: wise.totalUSD,
      totalPortfolioUsd: portfolioUsd || wise.totalUSD,
      walletAddress: `0x${Buffer.from(user.id).toString('hex').slice(0, 40)}`,
      topHoldings: [
        { symbol: 'USD', amount: wise.usdBalance },
        { symbol: 'CAD', amount: wise.cadBalance },
        { symbol: 'STRIPE', amount: GLOBAL_STRIPE_BALANCE.available }
      ]
    };

    const passJwt = await generateSovereignWalletPassJWT(passData);
    const addToWalletUrl = getAddToWalletUrl(passJwt);
    const qrDataUrl = await generatePassQRCode(passData);

    return {
      success: true,
      source: 'live',
      wise: {
        totalUSD: wise.totalUSD,
        cadBalance: wise.cadBalance,
        usdBalance: wise.usdBalance,
        cadRate: wise.cadRate,
        balances: wise.balances.map((balance) => ({
          currency: balance.currency,
          amount: balance.amount,
          accountNumber: String(balance.balanceId || balance.profileId || ''),
          profileId: balance.profileId,
          type: balance.type
        })),
        accountNumber: wise.accountNumber,
        routingNumber: wise.routingNumber,
        bankName: wise.bankName,
        profileId: wise.profileId,
        businessName: wise.businessName
      },
      stripe: {
        available: GLOBAL_STRIPE_BALANCE.available,
        pending: GLOBAL_STRIPE_BALANCE.pending,
        total: GLOBAL_STRIPE_BALANCE.available + GLOBAL_STRIPE_BALANCE.pending,
        lastUpdated: GLOBAL_STRIPE_BALANCE.lastUpdated
      },
      walletPass: {
        addToWalletUrl,
        qrDataUrl,
        passJwt
      },
      treasury: {
        totalBalanceUsd: wise.totalUSD + GLOBAL_STRIPE_BALANCE.available,
        ledgerBalanceUsd: ledgerBalance,
        availableBalanceUsd: Math.max(walletBalance, wise.totalUSD + GLOBAL_STRIPE_BALANCE.available)
      }
    };
  } catch (error: any) {
    logger.error('Failed to build live integration snapshot', { error: error?.message || error });
    const fallbackWise = await getWiseTotalCashUSD().catch(() => ({
      totalUSD: 2478350,
      cadBalance: 185000,
      usdBalance: 2478350,
      cadRate: 1.36,
      balances: [],
      accountNumber: '176576596814061',
      routingNumber: '084009519',
      bankName: 'Wise US Inc',
      profileId: 101924589,
      businessName: 'sovereigns'
    }));
    return {
      success: false,
      source: 'fallback',
      wise: {
        totalUSD: fallbackWise.totalUSD,
        cadBalance: fallbackWise.cadBalance,
        usdBalance: fallbackWise.usdBalance,
        cadRate: fallbackWise.cadRate,
        balances: fallbackWise.balances.map((balance) => ({
          currency: balance.currency,
          amount: balance.amount,
          accountNumber: String(balance.balanceId || balance.profileId || ''),
          profileId: balance.profileId,
          type: balance.type
        })),
        accountNumber: fallbackWise.accountNumber,
        routingNumber: fallbackWise.routingNumber,
        bankName: fallbackWise.bankName,
        profileId: fallbackWise.profileId,
        businessName: fallbackWise.businessName
      },
      stripe: {
        available: GLOBAL_STRIPE_BALANCE.available,
        pending: GLOBAL_STRIPE_BALANCE.pending,
        total: GLOBAL_STRIPE_BALANCE.available + GLOBAL_STRIPE_BALANCE.pending,
        lastUpdated: GLOBAL_STRIPE_BALANCE.lastUpdated
      },
      walletPass: {
        addToWalletUrl: '',
        qrDataUrl: '',
        passJwt: ''
      },
      treasury: {
        totalBalanceUsd: fallbackWise.totalUSD + GLOBAL_STRIPE_BALANCE.available,
        ledgerBalanceUsd: 0,
        availableBalanceUsd: fallbackWise.totalUSD + GLOBAL_STRIPE_BALANCE.available
      }
    };
  }
}
