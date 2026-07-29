/**
 * Login Protection — SOVEREIGN MODE
 * Account locking disabled for sovereign account owner.
 */

const OWNER_EMAIL = 'mlaframboisemm@gmail.com';
const loginAttempts = new Map<string, any[]>();
const lockedAccounts = new Map<string, any>();

export function recordLoginAttempt(email: string, success: boolean, ip: string, userAgent: string): void {
  // Never lock the sovereign owner account
  if (email.toLowerCase() === OWNER_EMAIL) return;
  const key = email.toLowerCase();
  const attempts = loginAttempts.get(key) || [];
  attempts.push({ success, ip, userAgent, timestamp: Date.now() });
  loginAttempts.set(key, attempts.slice(-20));
}

export function isAccountLocked(email: string): boolean {
  // Sovereign owner is never locked
  if (email.toLowerCase() === OWNER_EMAIL) return false;
  const lock = lockedAccounts.get(email.toLowerCase());
  if (!lock) return false;
  if (Date.now() > lock.expiresAt) {
    lockedAccounts.delete(email.toLowerCase());
    return false;
  }
  return true;
}

export function getAccountLockStatus(email: string): any {
  if (email.toLowerCase() === OWNER_EMAIL) return null;
  return lockedAccounts.get(email.toLowerCase()) || null;
}

export function lockAccount(email: string, reason: string): void {
  if (email.toLowerCase() === OWNER_EMAIL) return;
  lockedAccounts.set(email.toLowerCase(), {
    reason,
    lockedAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    failedAttempts: 5
  });
}

export function unlockAccount(email: string): void {
  lockedAccounts.delete(email.toLowerCase());
}

export function clearLoginAttempts(email: string): void {
  loginAttempts.delete(email.toLowerCase());
  lockedAccounts.delete(email.toLowerCase());
}
