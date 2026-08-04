import { getCriticalOperationsEnforcementState } from './critical-operations-enforcer.js';

export interface RuntimeReadinessReport {
  isReady: boolean;
  missingConfig: string[];
  checks: Array<{
    name: string;
    status: 'configured' | 'missing' | 'safe' | 'unsafe';
    details?: string;
  }>;
}

function hasExchangeProviderConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    (env.COINBASE_API_KEY_ID && env.COINBASE_API_SECRET_RAW) ||
    (env.KRAKEN_API_KEY && env.KRAKEN_API_SECRET)
  );
}

function hasEmailProviderConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.MAILERSEND_API_KEY ||
    (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
  );
}

function hasWiseConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.WISE_API_TOKEN ||
    env.WISE_ALL_ACCESS_KEY ||
    env.WISE_PERSONAL_TOKEN ||
    env.WISE_ACCESS_TOKEN
  );
}

function hasPlaidConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET);
}

function hasStripeConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function hasKrakenConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.KRAKEN_API_KEY && env.KRAKEN_API_SECRET);
}

export async function buildRuntimeReadinessReport(env: NodeJS.ProcessEnv): Promise<RuntimeReadinessReport> {
  const missingConfig: string[] = [];

  if (!env.SOVEREIGN_ENCRYPTION_KEY || env.SOVEREIGN_ENCRYPTION_KEY.trim().length < 32) {
    missingConfig.push('SOVEREIGN_ENCRYPTION_KEY(>=32 chars)');
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) {
    missingConfig.push('JWT_SECRET(>=32 chars)');
  }
  if (!env.MARSHALL_WALLET_PRIVATE_KEY) {
    missingConfig.push('MARSHALL_WALLET_PRIVATE_KEY');
  }
  if (!hasExchangeProviderConfigured(env)) {
    missingConfig.push('Coinbase or Kraken exchange API credentials');
  }
  if (!hasWiseConfigured(env)) {
    missingConfig.push('WISE_API_TOKEN (or compatible alias)');
  }
  if (!hasPlaidConfigured(env)) {
    missingConfig.push('PLAID_CLIENT_ID and PLAID_SECRET');
  }
  if (!hasStripeConfigured(env)) {
    missingConfig.push('STRIPE_SECRET_KEY');
  }
  if (!hasKrakenConfigured(env)) {
    missingConfig.push('KRAKEN_API_KEY and KRAKEN_API_SECRET');
  }
  if (!hasEmailProviderConfigured(env)) {
    missingConfig.push('MAILERSEND_API_KEY or SMTP credentials');
  }
  if (!env.SOVEREIGN_ADMIN_EMAILS || !env.SOVEREIGN_ADMIN_EMAILS.trim()) {
    missingConfig.push('SOVEREIGN_ADMIN_EMAILS');
  }

  const enforcementState = getCriticalOperationsEnforcementState();
  const enforcementSafe = enforcementState.requiresVerifiedExternalProof && enforcementState.moneyMovingOperationsBlockedUntilVerified;

  const checks: RuntimeReadinessReport['checks'] = [
    {
      name: 'SOVEREIGN_ENCRYPTION_KEY',
      status: env.SOVEREIGN_ENCRYPTION_KEY && env.SOVEREIGN_ENCRYPTION_KEY.trim().length >= 32 ? 'configured' : 'missing'
    },
    {
      name: 'JWT_SECRET',
      status: env.JWT_SECRET && env.JWT_SECRET.trim().length >= 32 ? 'configured' : 'missing'
    },
    {
      name: 'MARSHALL_WALLET_PRIVATE_KEY',
      status: env.MARSHALL_WALLET_PRIVATE_KEY ? 'configured' : 'missing'
    },
    {
      name: 'Exchange credentials',
      status: hasExchangeProviderConfigured(env) ? 'configured' : 'missing'
    },
    {
      name: 'Wise credentials',
      status: hasWiseConfigured(env) ? 'configured' : 'missing'
    },
    {
      name: 'Plaid credentials',
      status: hasPlaidConfigured(env) ? 'configured' : 'missing'
    },
    {
      name: 'Stripe credentials',
      status: hasStripeConfigured(env) ? 'configured' : 'missing'
    },
    {
      name: 'Kraken credentials',
      status: hasKrakenConfigured(env) ? 'configured' : 'missing'
    },
    {
      name: 'Email credentials',
      status: hasEmailProviderConfigured(env) ? 'configured' : 'missing'
    },
    {
      name: 'Admin emails',
      status: env.SOVEREIGN_ADMIN_EMAILS && env.SOVEREIGN_ADMIN_EMAILS.trim() ? 'configured' : 'missing'
    },
    {
      name: 'Financial proof enforcement',
      status: enforcementSafe ? 'safe' : 'unsafe',
      details: enforcementSafe
        ? 'Money-moving routes require verified external proof before success is reported.'
        : 'Financial proof enforcement is not active.'
    }
  ];

  return {
    isReady: missingConfig.length === 0 && enforcementSafe,
    missingConfig,
    checks
  };
}
