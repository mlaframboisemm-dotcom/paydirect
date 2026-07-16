import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, TrendingDown, Wallet, Clock, Search, ListFilter, Star, ArrowUpRight, 
  ArrowDownLeft, Sparkles, RefreshCw, ChevronRight, CheckCircle2, ShieldAlert, Award, 
  BookOpen, Eye, HelpCircle, Newspaper, ThumbsUp, Plus, CreditCard, AlertCircle, Check
} from 'lucide-react';

import { Coin, Holding, Transaction, Quiz, TimeFrame } from './types';
import Header from './components/Header';
import TradeWidget from './components/TradeWidget';
import AssetDetailModal from './components/AssetDetailModal';
import EarnRewards from './components/EarnRewards';
import CoinbaseCard from './components/CoinbaseCard';
import SendReceiveModal from './components/SendReceiveModal';
import CoinChart from './components/CoinChart';
import CashTransferModal from './components/CashTransferModal';
import AddressHub from './components/AddressHub';
import DeveloperHub from './components/DeveloperHub';
import OnboardingKyc from './components/OnboardingKyc';
import AuthScreen from './components/AuthScreen';
import EmailInbox, { InboxEmail } from './components/EmailInbox';
import { convertUsdToCad, DEFAULT_USD_CAD_RATE } from './lib/financial-hardening';

const configuredApiBase = String(
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_API_BASE_URL ||
  ''
).trim();
function buildApiUrl(path: string): string {
  const safePath = typeof path === 'string' && path.trim().length > 0 ? path.trim() : '/';
  const normalized = safePath.startsWith('/') ? safePath : `/${safePath}`;
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'file:') {
      return `http://localhost:3000${normalized}`;
    }
    if (window.location?.origin && window.location.origin !== 'null') {
      return `${window.location.origin}${normalized}`;
    }
  }
  if (configuredApiBase) {
    return new URL(normalized, configuredApiBase).toString();
  }
  return normalized;
}

function buildAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const token = sessionStorage.getItem('cb_auth_jwt_token') || localStorage.getItem('cb_auth_jwt_token');
  return {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(extraHeaders || {})
  };
}

function hasSessionToken(): boolean {
  const token = sessionStorage.getItem('cb_auth_jwt_token') || localStorage.getItem('cb_auth_jwt_token');
  return !!token;
}

const USER_SCOPED_STATE_KEYS = [
  'cb_coins',
  'cb_holdings',
  'cb_usd_balance',
  'cb_transactions',
  'cb_quizzes',
  'cb_watchlist',
  'cb_inbox_emails',
  'cb_kyc_level',
  'cb_citizenship'
] as const;

function getUserScopedStorageKey(email: string, key: string): string {
  return `cb_user_${email.trim().toLowerCase()}_${key}`;
}

/**
 * Format balance based on user citizenship
 * Converts USD to CAD if citizenship is 'CA'
 */
function formatBalanceByCurrency(usdAmount: number, citizenship: string, rate: number = DEFAULT_USD_CAD_RATE): number {
  if (citizenship === 'CA' || citizenship === 'Canada') {
    return convertUsdToCad(usdAmount, rate);
  }
  return usdAmount;
}

/**
 * Get currency symbol based on citizenship
 */
function getCurrencySymbol(citizenship: string): string {
  return (citizenship === 'CA' || citizenship === 'Canada') ? 'CAD' : 'USD';
}

function buildCoinFromLive(symbol: string, usd: number, popularity: number): Coin {
  return {
    id: symbol.toLowerCase(),
    name: symbol,
    symbol,
    price: usd,
    change24h: 0,
    volume24h: 0,
    marketCap: 0,
    color: '#0052FF',
    description: `${symbol} live market feed`,
    circulatingSupply: 'N/A',
    allTimeHigh: usd,
    popularity,
    sparkline: Array(10).fill(usd),
    history1D: Array(24).fill(usd),
    history1W: Array(50).fill(usd),
    history1M: Array(100).fill(usd),
    history1Y: Array(200).fill(usd)
  };
}

export default function App() {
  const hasLoggedPriceFetchError = useRef(false);
  const hasLoggedBalanceSyncError = useRef(false);
  const hasLoggedEmailSyncError = useRef(false);
  // --- Persistent LocalState initialization ---
  const [coins, setCoins] = useState<Coin[]>(() => {
    const saved = localStorage.getItem('cb_coins');
    return saved ? JSON.parse(saved) : [];
  });

  const [holdings, setHoldings] = useState<Holding[]>(() => {
    const saved = localStorage.getItem('cb_holdings');
    return saved ? JSON.parse(saved) : [];
  });

  const [usdBalance, setUsdBalance] = useState<number>(() => {
    const saved = localStorage.getItem('cb_usd_balance');
    return saved ? parseFloat(saved) : 0;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('cb_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [quizzes, setQuizzes] = useState<Quiz[]>(() => {
    const saved = localStorage.getItem('cb_quizzes');
    return saved ? JSON.parse(saved) : [];
  });

  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const saved = localStorage.getItem('cb_watchlist');
    return saved ? JSON.parse(saved) : ['BTC', 'ETH', 'SOL'];
  });

  // UI state
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState<string>('BTC');
  const [detailCoin, setDetailCoin] = useState<Coin | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSendReceiveOpen, setIsSendReceiveOpen] = useState(false);
  const [sendReceiveAction, setSendReceiveAction] = useState<'send' | 'receive'>('send');
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashModalAction, setCashModalAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Stripe Hub states
  const [stripeAvailable, setStripeAvailable] = useState<number>(0);
  const [stripePending, setStripePending] = useState<number>(0);
  const [stripeTotal, setStripeTotal] = useState<number>(0);
  const [isFetchingStripeBalance, setIsFetchingStripeBalance] = useState(false);
  const [isProcessingStripePayout, setIsProcessingStripePayout] = useState(false);
  const [stripePayoutAmount, setStripePayoutAmount] = useState('');
  const [stripePayoutError, setStripePayoutError] = useState<string | null>(null);
  const [stripePayoutSuccess, setStripePayoutSuccess] = useState<string | null>(null);
  const [isStripeConfigured, setIsStripeConfigured] = useState<boolean>(false);
  
  // Market search & filters
  const [marketFilter, setMarketFilter] = useState<'all' | 'gainers' | 'losers' | 'watchlist'>('all');
  const [marketSearchQuery, setMarketSearchQuery] = useState('');

  // Toast notifications for workflow actions
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Real Coinbase Mode states
  const [realCoinbaseMode, setRealCoinbaseMode] = useState<boolean>(false);
  const [isRefreshingReal, setIsRefreshingReal] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<'online' | 'degraded' | 'offline'>('online');

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const auth = localStorage.getItem('cb_auth_authenticated') === 'true';
    const token = sessionStorage.getItem('cb_auth_jwt_token') || localStorage.getItem('cb_auth_jwt_token');
    return auth && !!token;
  });
  const [userEmail, setUserEmail] = useState<string>(() => {
    return localStorage.getItem('cb_auth_email') || '';
  });
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('cb_auth_name') || 'Jane Doe';
  });
  const [citizenship, setCitizenship] = useState<string>(() => {
    return localStorage.getItem('cb_citizenship') || 'US';
  });
  const [kycLevel, setKycLevel] = useState<number>(() => {
    return parseInt(localStorage.getItem('cb_kyc_level') || '2', 10);
  });
  const [isEmailInboxOpen, setIsEmailInboxOpen] = useState<boolean>(false);
  const [emails, setEmails] = useState<InboxEmail[]>(() => {
    const saved = localStorage.getItem('cb_inbox_emails');
    if (saved) return JSON.parse(saved);
    return [];
  });

  useEffect(() => {
    localStorage.setItem('cb_auth_authenticated', isAuthenticated.toString());
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;
    const checkBackend = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/health'));
        if (!active) return;
        if (response.ok) {
          setBackendStatus('online');
        } else {
          setBackendStatus('degraded');
        }
      } catch {
        if (active) {
          setBackendStatus('offline');
        }
      }
    };

    checkBackend();
    const interval = window.setInterval(checkBackend, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('cb_auth_email', userEmail);
  }, [userEmail]);

  useEffect(() => {
    localStorage.setItem('cb_auth_name', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('cb_citizenship', citizenship);
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_citizenship'), citizenship);
    }
  }, [citizenship, isAuthenticated, userEmail]);

  useEffect(() => {
    localStorage.setItem('cb_kyc_level', kycLevel.toString());
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_kyc_level'), kycLevel.toString());
    }
  }, [kycLevel, isAuthenticated, userEmail]);

  useEffect(() => {
    localStorage.setItem('cb_inbox_emails', JSON.stringify(emails));
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_inbox_emails'), JSON.stringify(emails));
    }
  }, [emails]);

  const migrateGlobalStateToUserScope = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    USER_SCOPED_STATE_KEYS.forEach((key) => {
      const scopedKey = getUserScopedStorageKey(normalizedEmail, key);
      if (localStorage.getItem(scopedKey) === null) {
        const globalValue = localStorage.getItem(key);
        if (globalValue !== null) {
          localStorage.setItem(scopedKey, globalValue);
        }
      }
    });
  };

  const hydrateStateFromUserScope = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    const read = (key: string) => localStorage.getItem(getUserScopedStorageKey(normalizedEmail, key));

    try {
      const scopedCoins = read('cb_coins');
      if (scopedCoins) setCoins(JSON.parse(scopedCoins));
    } catch {
      // keep existing state on parse failure
    }

    try {
      const scopedHoldings = read('cb_holdings');
      if (scopedHoldings) setHoldings(JSON.parse(scopedHoldings));
    } catch {
      // keep existing state on parse failure
    }

    const scopedUsdBalance = read('cb_usd_balance');
    if (scopedUsdBalance && Number.isFinite(Number(scopedUsdBalance))) {
      setUsdBalance(Number(scopedUsdBalance));
    }

    try {
      const scopedTransactions = read('cb_transactions');
      if (scopedTransactions) setTransactions(JSON.parse(scopedTransactions));
    } catch {
      // keep existing state on parse failure
    }

    try {
      const scopedQuizzes = read('cb_quizzes');
      if (scopedQuizzes) setQuizzes(JSON.parse(scopedQuizzes));
    } catch {
      // keep existing state on parse failure
    }

    try {
      const scopedWatchlist = read('cb_watchlist');
      if (scopedWatchlist) setWatchlist(JSON.parse(scopedWatchlist));
    } catch {
      // keep existing state on parse failure
    }

    try {
      const scopedEmails = read('cb_simulated_emails');
      if (scopedEmails) setEmails(JSON.parse(scopedEmails));
    } catch {
      // keep existing state on parse failure
    }

    const scopedKyc = read('cb_kyc_level');
    if (scopedKyc && Number.isFinite(Number(scopedKyc))) {
      setKycLevel(parseInt(scopedKyc, 10));
    }

    const scopedCitizenship = read('cb_citizenship');
    if (scopedCitizenship) {
      setCitizenship(scopedCitizenship);
    }
  };

  const handleConfirmEmailAction = (actionType: string, payload: any) => {
    if (actionType === 'verify_email') {
      showToast('Email verified successfully! Interac e-Transfers are now fully unlocked.', 'success');
      setKycLevel(2);
    } else if (actionType === 'approve_transfer') {
      showToast('Interac e-transfer deposit approved securely. Funds have been credited!', 'success');
      if (payload && payload.amount) {
        setUsdBalance(prev => prev + parseFloat(payload.amount));
        const tx: Transaction = {
          id: `tx-etransfer-${Date.now()}`,
          type: 'RECEIVE',
          assetSymbol: 'USD',
          amount: parseFloat(payload.amount),
          fiatAmount: parseFloat(payload.amount),
          timestamp: Date.now(),
          details: 'Interac e-Transfer Deposit Cleared & Confirmed',
          status: 'completed',
          ledgerDebit: 'Cash Operational Reserve (CAD Clearing)',
          ledgerCredit: 'Interac Settlement Ledger'
        };
        setTransactions(prev => [tx, ...prev]);
      }
    } else if (actionType === 'confirm_2fa') {
      showToast('Two-factor authentication approved. Device is now whitelisted.', 'success');
    }
  };

  const handleLogout = () => {
    fetch(buildApiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: buildAuthHeaders(),
      credentials: 'include'
    }).catch(() => {});
    localStorage.removeItem('cb_auth_authenticated');
    localStorage.removeItem('cb_auth_email');
    localStorage.removeItem('cb_auth_name');
    localStorage.removeItem('cb_citizenship');
    localStorage.removeItem('cb_kyc_level');
    sessionStorage.removeItem('cb_auth_jwt_token');
    localStorage.removeItem('cb_auth_jwt_token');
    setIsAuthenticated(false);
    setUserEmail('');
    setUserName('');
    setCitizenship('US');
    setKycLevel(1);
    setRealCoinbaseMode(false); // Reset real mode
    showToast('Signed out of Coinbase successfully.', 'info');
  };

  const handleAuthExpired = () => {
    localStorage.removeItem('cb_auth_authenticated');
    localStorage.removeItem('cb_auth_email');
    localStorage.removeItem('cb_auth_name');
    localStorage.removeItem('cb_auth_jwt_token');
    sessionStorage.removeItem('cb_auth_jwt_token');
    setIsAuthenticated(false);
    setRealCoinbaseMode(false);
    showToast('Session expired. Please sign in again.', 'info');
  };

  const syncCoinbaseBalances = async () => {
    if (!hasSessionToken()) {
      return;
    }

    try {
      const configRes = await fetch(buildApiUrl('/api/coinbase/config'), {
        headers: buildAuthHeaders(),
        credentials: 'include'
      });
      if (configRes.status === 401) {
        handleAuthExpired();
        return;
      }
      if (!configRes.ok) return;
      hasLoggedBalanceSyncError.current = false;
      const config = await configRes.json();
      
      const isReal = config.mode === 'real';
      setRealCoinbaseMode(isReal);
      setIsStripeConfigured(!!config.stripeConfigured);

      setIsRefreshingReal(true);
      const balRes = await fetch(buildApiUrl('/api/coinbase/balances'), {
        headers: buildAuthHeaders(),
        credentials: 'include'
      });
      if (balRes.status === 401) {
        handleAuthExpired();
        return;
      }
      if (balRes.ok) {
        const balData = await balRes.json();
        if (balData.holdings) {
          setHoldings(balData.holdings);
        }
        if (typeof balData.usdBalance === 'number') {
          setUsdBalance(balData.usdBalance);
        }
        if (balData.transactions) {
          setTransactions(balData.transactions);
        }
        if (isReal) {
          showToast('Synchronized portfolios live with Coinbase Brokerage ledger!', 'success');
        }
      } else {
        let reason = '';
        try {
          const errorData = await balRes.json();
          reason = String(errorData?.error || errorData?.message || '');
        } catch {
          // Keep empty reason when body is not JSON.
        }

        if (reason.includes('COINBASE_NOT_CONFIGURED')) {
          setRealCoinbaseMode(false);
        } else if (isReal) {
          showToast('Failed to sync portfolios from live brokerage backend.', 'error');
        }
      }
    } catch (e) {
      if (!hasLoggedBalanceSyncError.current) {
        console.error('Error syncing balances:', e);
        hasLoggedBalanceSyncError.current = true;
      }
    } finally {
      setIsRefreshingReal(false);
    }
  };

  // Sync to LocalStorage on modifications
  useEffect(() => {
    localStorage.setItem('cb_coins', JSON.stringify(coins));
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_coins'), JSON.stringify(coins));
    }
  }, [coins]);

  useEffect(() => {
    localStorage.setItem('cb_holdings', JSON.stringify(holdings));
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_holdings'), JSON.stringify(holdings));
    }
  }, [holdings]);

  useEffect(() => {
    localStorage.setItem('cb_usd_balance', usdBalance.toString());
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_usd_balance'), usdBalance.toString());
    }
  }, [usdBalance]);

  useEffect(() => {
    localStorage.setItem('cb_transactions', JSON.stringify(transactions));
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_transactions'), JSON.stringify(transactions));
    }
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('cb_quizzes', JSON.stringify(quizzes));
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_quizzes'), JSON.stringify(quizzes));
    }
  }, [quizzes]);

  useEffect(() => {
    localStorage.setItem('cb_watchlist', JSON.stringify(watchlist));
    if (isAuthenticated && userEmail) {
      localStorage.setItem(getUserScopedStorageKey(userEmail, 'cb_watchlist'), JSON.stringify(watchlist));
    }
  }, [watchlist]);

  // Auth token pre-fetching & balance synchronizer
  useEffect(() => {
    const initTokenAndSync = async () => {
      if (isAuthenticated) {
        if (!hasSessionToken()) {
          handleAuthExpired();
          return;
        }
        syncCoinbaseBalances();
      }
    };
    initTokenAndSync();
  }, [isAuthenticated, userEmail, userName]);

  // Polling for balances
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      syncCoinbaseBalances();
    }, 25000); // Poll every 25 seconds
    return () => clearInterval(interval);
  }, [realCoinbaseMode, isAuthenticated]);

  const fetchStripeBalance = async () => {
    if (!isAuthenticated || !hasSessionToken()) return;
    setIsFetchingStripeBalance(true);
    try {
      const res = await fetch(buildApiUrl('/api/stripe/balance'), {
        headers: buildAuthHeaders(),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setStripeAvailable(data.available || 0);
        setStripePending(data.pending || 0);
        setStripeTotal(data.total || 0);
        setIsStripeConfigured(true);
      } else if (res.status === 501) {
        setIsStripeConfigured(false);
      }
    } catch (err) {
      console.warn('Failed to fetch Stripe balance:', err);
    } finally {
      setIsFetchingStripeBalance(false);
    }
  };

  const handleTriggerStripePayout = async (amountNum: number) => {
    setStripePayoutError(null);
    setStripePayoutSuccess(null);
    setIsProcessingStripePayout(true);
    try {
      const res = await fetch(buildApiUrl('/api/stripe/payout'), {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ amount: amountNum })
      });
      const data = await res.json();
      if (res.ok) {
        setStripePayoutSuccess(`Payout of CA$${amountNum.toFixed(2)} initiated successfully to your connected bank account!`);
        showToast(`Stripe payout of CA$${amountNum.toFixed(2)} dispatched!`, 'success');
        setStripePayoutAmount('');
        fetchStripeBalance();
        syncCoinbaseBalances();
      } else {
        setStripePayoutError(data.message || data.error || 'Failed to dispatch Stripe payout.');
      }
    } catch (err: any) {
      setStripePayoutError(err.message || 'Payout request failed.');
    } finally {
      setIsProcessingStripePayout(false);
    }
  };

  useEffect(() => {
    if (currentTab === 'stripe' && isAuthenticated) {
      fetchStripeBalance();
    }
  }, [currentTab, isAuthenticated]);

  // --- Real-time Price Integration from Sovereign Backend ---
  useEffect(() => {
    const fetchLivePrices = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/prices'));
        if (res.ok) {
          hasLoggedPriceFetchError.current = false;
          const data = await res.json();
          setCoins((prevCoins) =>
            prevCoins.length === 0
              ? Object.entries(data)
                  .filter(([symbol, value]: any) => typeof symbol === 'string' && value && typeof value.USD === 'number')
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([symbol, value]: any, index) => buildCoinFromLive(symbol, Number(value.USD), index + 1))
              : prevCoins
                  .filter((coin) => coin && coin.symbol)
                  .map((coin) => {
                    const liveData = data[coin.symbol];
                  if (liveData && typeof liveData.USD === 'number') {
                    const newPrice = liveData.USD;
                    const updatedSparkline = [...coin.sparkline.slice(1), parseFloat(newPrice.toFixed(4))];
                    const updatedHistory1D = [...coin.history1D.slice(1), parseFloat(newPrice.toFixed(2))];
                    return {
                      ...coin,
                      price: newPrice,
                      sparkline: updatedSparkline,
                      history1D: updatedHistory1D
                    };
                  }
                  return coin;
                })
          );
        }
      } catch (e) {
        if (!hasLoggedPriceFetchError.current) {
          console.error('Failed to fetch live prices from Sovereign backend:', e);
          hasLoggedPriceFetchError.current = true;
        }
      }
    };

    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 20000); // Update every 20 seconds
    return () => clearInterval(interval);
  }, []);

  // --- Sync Email Inbox from Sovereign Backend ---
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!hasSessionToken()) {
      handleAuthExpired();
      return;
    }
    const syncEmails = async () => {
      if (import.meta.env.PROD) {
        return;
      }
      try {
        const res = await fetch(buildApiUrl('/api/messaging/emails'), {
          headers: buildAuthHeaders(),
          credentials: 'include'
        });
        if (res.status === 401) {
          handleAuthExpired();
          return;
        }
        if (res.status === 403) {
          return;
        }
        if (res.ok) {
          hasLoggedEmailSyncError.current = false;
          const data = await res.json();
          if (data.success && data.emails) {
            setEmails(data.emails);
          }
        }
      } catch (e) {
        if (!hasLoggedEmailSyncError.current) {
          console.error('Failed to sync emails from Sovereign backend:', e);
          hasLoggedEmailSyncError.current = true;
        }
      }
    };
    syncEmails();
    const interval = setInterval(syncEmails, 15000); // Update every 15 seconds
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Show customized floating toast alerts
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Listen for 'code' query parameter and exchange it for a secure session token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const transferId = params.get('transfer_id') || params.get('state');

    if (code) {
      const exchangeCodeForSession = async () => {
        showToast('Exchanging bank authorization code for secure session...', 'info');
        try {
          const response = await fetch(buildApiUrl('/api/auth/exchange-code'), {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ code, transfer_id: transferId })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to exchange authentication code.');
          }

          const data = await response.json();
          if (data.success && data.token) {
            // Secure session token exchanged successfully
            sessionStorage.setItem('cb_auth_jwt_token', data.token);
            localStorage.setItem('cb_auth_jwt_token', data.token);
            localStorage.setItem('cb_auth_authenticated', 'true');
            
            if (data.user) {
              migrateGlobalStateToUserScope(data.user.email);
              hydrateStateFromUserScope(data.user.email);
              setUserName(data.user.name);
              setUserEmail(data.user.email);
              setCitizenship(data.user.region || 'CA');
              setKycLevel(data.user.kycLevel !== undefined ? data.user.kycLevel : 2);
            }
            
            setIsAuthenticated(true);
            showToast('Secure session handshake established successfully with backend gateway!', 'success');
            
            // If there's a transfer ID, open the Cash Modal automatically to let the finalize effect process
            if (transferId) {
              setCashModalAction('deposit');
              setIsCashModalOpen(true);
            }
          }
        } catch (error: any) {
          console.error('Session exchange failed:', error);
          showToast(`Session Exchange Failed: ${error.message}`, 'error');
        }
      };

      exchangeCodeForSession();
    }
  }, []);

  // Auto-login to mlaframboisemm@gmail.com on startup
  useEffect(() => {
    const autoLogin = async () => {
      const savedEmail = localStorage.getItem('cb_auth_email');
      const savedAuthenticated = localStorage.getItem('cb_auth_authenticated') === 'true';

      if (!savedAuthenticated || savedEmail !== 'mlaframboisemm@gmail.com') {
        try {
          const response = await fetch(buildApiUrl('/api/auth/auto-login'), {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.token) {
              sessionStorage.setItem('cb_auth_jwt_token', data.token);
              localStorage.setItem('cb_auth_jwt_token', data.token);
              localStorage.setItem('cb_auth_authenticated', 'true');
              localStorage.setItem('cb_auth_email', data.user.email);
              localStorage.setItem('cb_auth_name', data.user.name);

              migrateGlobalStateToUserScope(data.user.email);
              hydrateStateFromUserScope(data.user.email);
              setUserName(data.user.name);
              setUserEmail(data.user.email);
              setCitizenship(data.user.region || 'CA');
              setKycLevel(data.user.kycLevel !== undefined ? data.user.kycLevel : 3);
              setIsAuthenticated(true);
              showToast('Successfully signed in to your live profile & account!', 'success');
            }
          }
        } catch (error) {
          console.error('[Auto Login Mount Error]', error);
        }
      }
    };
    autoLogin();
  }, []);

  // --- Calculations for Portfolio Sums ---
  const cryptoTotalValue = useMemo(() => {
    return holdings.reduce((sum, hold) => {
      const coin = coins.find((c) => c && c.symbol === hold.symbol);
      const coinPrice = coin ? coin.price : 0;
      return sum + (hold.amount * coinPrice);
    }, 0);
  }, [holdings, coins]);

  const netWorth = cryptoTotalValue + usdBalance;

  const previousNetWorth = useMemo(() => {
    // Computes previous value based on 24h change ratios for portfolio items
    return holdings.reduce((sum, hold) => {
      const coin = coins.find((c) => c && c.symbol === hold.symbol);
      const coinPrevPrice = coin ? coin.price / (1 + coin.change24h / 100) : 0;
      return sum + (hold.amount * coinPrevPrice);
    }, 0) + usdBalance;
  }, [holdings, coins, usdBalance]);

  const netWorthChangeUSD = netWorth - previousNetWorth;
  const netWorthChangePercent = previousNetWorth === 0 ? 0 : (netWorthChangeUSD / previousNetWorth) * 100;

  // --- Custom interactive aggregations for the core portfolio area chart ---
  const currentCoin = coins.find((c) => c && c.symbol === selectedAssetSymbol) || null;

  // Toggle watchlist coin helper
  const handleToggleWatchlist = (symbol: string) => {
    if (watchlist.includes(symbol)) {
      setWatchlist(watchlist.filter((s) => s !== symbol));
      showToast(`Removed ${symbol} from watchlist.`, 'info');
    } else {
      setWatchlist([...watchlist, symbol]);
      showToast(`Added ${symbol} to watchlist!`, 'success');
    }
  };

  // --- Trade Executions handler ---
  const handleExecuteTrade = async (
    type: 'BUY' | 'SELL' | 'CONVERT',
    params: {
      symbol: string;
      amount: number;
      fiatAmount: number;
      targetSymbol?: string;
    }
  ) => {
    const coin = coins.find((c) => c && c.symbol === params.symbol);
    if (!coin) return;

    try {
      showToast(`Initiating secure ${type} execution on Sovereign Wealth backend...`, 'info');

      const response = await fetch(buildApiUrl('/api/coinbase/trade'), {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
          'x-idempotency-key': `trade-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
        }),
        credentials: 'include',
        body: JSON.stringify({
          side: type,
          symbol: params.symbol,
          amount: params.amount,
          fiatAmount: params.fiatAmount,
          targetSymbol: params.targetSymbol
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        showToast(data.message || `Successfully executed ${type} trade!`, 'success');
        syncCoinbaseBalances();
      } else {
        showToast(`Trade Failed: ${data.message || data.error || 'Transaction rejected by backend.'}`, 'error');
      }
    } catch (e: any) {
      showToast(`Trade Execution Error: ${e.message}`, 'error');
    }
  };

  // --- Send Receive transactions handler ---
  const handleExecuteSendReceive = async (
    type: 'SEND' | 'RECEIVE',
    symbol: string,
    amount: number,
    fiatAmount: number,
    details: string
  ) => {
    const coin = coins.find((c) => c && c.symbol === symbol);
    if (!coin) return;

    if (type === 'SEND') {
      try {
        showToast(`Broadcasting transfer of ${amount} ${symbol} to blockchain...`, 'info');

        const response = await fetch(buildApiUrl('/api/coinbase/send'), {
          method: 'POST',
          headers: buildAuthHeaders({
            'Content-Type': 'application/json'
          }),
          credentials: 'include',
          body: JSON.stringify({
            symbol,
            amount,
            toAddress: details // details contains the destination address
          })
        });

        const data = await response.json();
        if (response.ok && data.success) {
          showToast(`Successfully sent ${amount.toFixed(5)} ${symbol}! Tx Hash: ${data.hash || 'pending'}`, 'success');
          syncCoinbaseBalances();
        } else {
          showToast(`Transfer Failed: ${data.message || data.error || 'Transaction rejected.'}`, 'error');
        }
      } catch (e: any) {
        showToast(`Transfer Execution Error: ${e.message}`, 'error');
      }
    } 
    
    else if (type === 'RECEIVE') {
      showToast(`On-chain deposit address for ${symbol} copied!`, 'success');
    }
  };

  // --- Learning Rewards quiz completions ---
  const handleCompleteQuiz = async (quizId: string, rewardSymbol: string, rewardAmount: number) => {
    try {
      const response = await fetch(buildApiUrl('/api/coinbase/quiz'), {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json'
        }),
        credentials: 'include',
        body: JSON.stringify({ quizId, rewardSymbol, rewardAmount })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setQuizzes((prev) =>
          prev.map((q) => (q.id === quizId ? { ...q, completed: true } : q))
        );
        showToast(`Claimed $${rewardAmount.toFixed(2)} of ${rewardSymbol} successfully!`, 'success');
        syncCoinbaseBalances();
      } else {
        showToast(`Quiz Claim Failed: ${data.error || 'error'}`, 'error');
      }
    } catch (e) {
      console.error('Quiz completion error:', e);
    }
  };

  // --- Visa Debit Card payments simulation handler ---
  const handleDebitCardSpend = (
    fiatAmount: number,
    backingSymbol: string,
    cashbackSymbol: string,
    cashbackPercent: number
  ): boolean => {
    const cbCoin = coins.find((c) => c && c.symbol === cashbackSymbol);
    if (!cbCoin) return false;

    if (backingSymbol === 'USD') {
      if (fiatAmount > usdBalance) return false;

      // Deduct USD cash
      setUsdBalance((prev) => prev - fiatAmount);
    } else {
      const backingHolding = holdings.find((h) => h.symbol === backingSymbol);
      if (!backingHolding) return false;

      const coinPrice = coins.find((c) => c && c.symbol === backingSymbol)?.price || 1;
      const cryptoNeeded = fiatAmount / coinPrice;

      if (cryptoNeeded > backingHolding.amount) return false;

      // Deduct crypto
      setHoldings((prev) =>
        prev.map((h) => (h.symbol === backingSymbol ? { ...h, amount: h.amount - cryptoNeeded } : h)).filter((h) => h.amount > 0.000001)
      );
    }

    // Allocate cashback reward in chosen token
    const rewardFiat = fiatAmount * (cashbackPercent / 100);
    const rewardCryptoAmount = rewardFiat / cbCoin.price;

    setHoldings((prev) => {
      const existing = prev.find((h) => h.symbol === cashbackSymbol);
      if (existing) {
        return prev.map((h) =>
          h.symbol === cashbackSymbol
            ? { ...h, amount: h.amount + rewardCryptoAmount }
            : h
        );
      } else {
        return [...prev, { symbol: cashbackSymbol, amount: rewardCryptoAmount, avgBuyPrice: cbCoin.price }];
      }
    });

    // Write card transaction
    const tx: Transaction = {
      id: `tx-visa-${Date.now()}`,
      type: 'SELL',
      assetSymbol: backingSymbol,
      amount: backingSymbol === 'USD' ? fiatAmount : fiatAmount / (coins.find((c) => c && c.symbol === backingSymbol)?.price || 1),
      fiatAmount: fiatAmount,
      timestamp: Date.now(),
      details: `Coinbase Visa Card Spend. Earned +$${rewardFiat.toFixed(2)} cashback`
    };
    setTransactions((prev) => [tx, ...prev]);
    return true;
  };

  // --- Filtering assets table inside trade tab ---
  const filteredCoinsTable = useMemo(() => {
    return coins.filter((coin) => {
      const matchesSearch =
        coin.name.toLowerCase().includes(marketSearchQuery.toLowerCase()) ||
        coin.symbol.toLowerCase().includes(marketSearchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      if (marketFilter === 'watchlist') {
        return watchlist.includes(coin.symbol);
      } else if (marketFilter === 'gainers') {
        return coin.change24h > 0;
      } else if (marketFilter === 'losers') {
        return coin.change24h < 0;
      }
      return true;
    });
  }, [coins, marketFilter, marketSearchQuery, watchlist]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50/50 text-gray-900 font-sans flex flex-col justify-between">
        {/* Header containing placeholder and title */}
        <header className="border-b border-gray-100 bg-white h-16 flex items-center px-6 shrink-0">
          <div className="flex items-center space-x-2">
            <svg className="w-8 h-8 text-[#0052FF]" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span className="text-xl font-bold text-[#0052FF] tracking-tight">coinbase</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <AuthScreen
            onLoginSuccess={(userData) => {
              migrateGlobalStateToUserScope(userData.email);
              hydrateStateFromUserScope(userData.email);
              setUserName(userData.name);
              setUserEmail(userData.email);
              setCitizenship(userData.region);
              setIsAuthenticated(true);
              setKycLevel(userData.kycLevel !== undefined ? userData.kycLevel : (userData.isNewUser ? 1 : 2));
              showToast(`Welcome to Coinbase, ${userData.name}!`, 'success');
            }}
            showToast={showToast}
            onTriggerEmail={(subject, sender, senderEmail, bodyHtml, actionType, actionPayload) => {
              const newMail: InboxEmail = {
                id: `mail-${Date.now()}`,
                sender,
                senderEmail,
                subject,
                timestamp: Date.now(),
                bodyHtml,
                isRead: false,
                actionRequired: !!actionType,
                actionType: actionType as any,
                actionPayload
              };
              setEmails((prev) => [newMail, ...prev]);
              showToast('New system message sent to your secure inbox (bottom-left)', 'info');
            }}
          />
        </main>

        {/* Global secure email client drawer */}
        <EmailInbox
          emails={emails}
          onReadEmail={(id) => {
            setEmails((prev) =>
              prev.map((e) => (e.id === id ? { ...e, isRead: true } : e))
            );
          }}
          onConfirmAction={handleConfirmEmailAction}
          userEmail={userEmail}
          isOpen={isEmailInboxOpen}
          setIsOpen={setIsEmailInboxOpen}
        />

        {toast && (
          <div className="fixed bottom-6 right-6 z-50 transform transition-all duration-300 translate-y-0 scale-100 flex items-center space-x-2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-white/5 max-w-sm animate-slide-up">
            <Sparkles className="h-4.5 w-4.5 text-[#0052FF]" />
            <p className="text-xs font-semibold">{toast.message}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 text-gray-900 font-sans flex flex-col">
      {/* Dynamic Toast Notifications */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 transform transition-all duration-300 translate-y-0 scale-100 flex items-center space-x-2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-white/5 max-w-sm">
          <Sparkles className="h-4.5 w-4.5 text-[#0052FF]" />
          <p className="text-xs font-semibold">{toast.message}</p>
        </div>
      )}

      {/* Main Header navigation */}
      <Header
        coins={coins}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        portfolioValue={netWorth}
        onOpenSendReceive={(act) => {
          setSendReceiveAction(act);
          setIsSendReceiveOpen(true);
        }}
        onSearchSelect={(coin) => {
          setDetailCoin(coin);
          setIsDetailOpen(true);
        }}
        userName={userName}
        userEmail={userEmail}
        citizenship={citizenship}
        kycLevel={kycLevel}
        onLogout={handleLogout}
        realCoinbaseMode={realCoinbaseMode}
        backendStatus={backendStatus}
      />

      {/* Primary Layout Frame */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* --- Tab 1: Dashboard (Assets overview) --- */}
        {currentTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left wide content: Portfolio details & market tickers */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* Portfolio Net Worth Card */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs relative">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Total Net Worth ({getCurrencySymbol(citizenship)})</span>
                    <div className="flex items-baseline space-x-3 mt-1.5 select-none">
                      <span className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                        ${formatBalanceByCurrency(netWorth, citizenship).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`flex items-center text-xs sm:text-sm font-semibold rounded-full px-2 py-0.5 ${
                          netWorthChangeUSD >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
                        }`}
                      >
                        {netWorthChangeUSD >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
                        {netWorthChangeUSD >= 0 ? '+' : ''}
                        {netWorthChangePercent.toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-[11px] sm:text-xs text-gray-400 font-medium mt-1 block">
                      Combined Crypto Asset and USD Cash balances
                    </span>
                  </div>

                  {/* Cash Top up trigger */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setCashModalAction('deposit');
                        setIsCashModalOpen(true);
                      }}
                      className="px-3.5 py-2 bg-[#0052FF] hover:bg-blue-700 text-white border border-transparent text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center space-x-1.5 shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5 text-white" />
                      <span>Deposit Cash</span>
                    </button>
                    <button
                      onClick={() => {
                        setCashModalAction('withdraw');
                        setIsCashModalOpen(true);
                      }}
                      className="px-3.5 py-2 bg-gray-50 border border-gray-100 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center space-x-1.5"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 text-gray-500" />
                      <span>Withdraw Cash</span>
                    </button>
                  </div>
                </div>

                {/* Main Area Graphic - Aggregated from selectedAssetSymbol history */}
                <div className="mt-6 border-t border-gray-100 pt-6">
                  {currentCoin ? (
                    <CoinChart
                      data={currentCoin.history1D}
                      title={`${currentCoin.name} Portfolio Backing`}
                      change24h={currentCoin.change24h}
                      symbol={currentCoin.symbol}
                      selectedTimeframe="1D"
                      setSelectedTimeframe={() => {}}
                      basePrice={currentCoin.price}
                    />
                  ) : (
                    <div className="text-xs text-gray-500 font-semibold py-8 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
                      Waiting for live market data feed...
                    </div>
                  )}
                </div>

                {/* Quick Asset indicators pills */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {holdings.map((h) => {
                    const c = coins.find((coin) => coin && coin.symbol === h.symbol);
                    if (!c) return null;
                    return (
                      <button
                        key={h.symbol}
                        onClick={() => setSelectedAssetSymbol(h.symbol)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 border cursor-pointer ${
                          selectedAssetSymbol === h.symbol
                            ? 'bg-[#0052FF]/10 text-[#0052FF] border-[#0052FF]/30'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        <span>{h.symbol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Your assets breakdown table */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                    <Wallet className="h-4.5 w-4.5 text-gray-500" />
                    <span>Your Balances</span>
                  </h3>
                  <span className="text-[10px] bg-slate-100 font-bold px-2.5 py-0.5 rounded-full text-gray-500">
                    {holdings.length} Assets
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 text-[10px] uppercase font-bold tracking-wider bg-gray-50/20">
                        <th className="px-6 py-3.5">Asset</th>
                        <th className="px-6 py-3.5 text-right">Balance</th>
                        <th className="px-6 py-3.5 text-right">Allocation</th>
                        <th className="px-6 py-3.5 text-right">Price</th>
                        <th className="px-6 py-3.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {/* USD cash balance line */}
                      <tr className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-gray-900 flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-black text-xs">
                            $
                          </div>
                          <div>
                            <div className="text-sm font-bold">USD Cash</div>
                            <div className="text-xs text-gray-400 font-medium">Fiat Cash Balance</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-sm font-bold text-gray-900">
                            ${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-xs text-gray-500 font-mono font-semibold">
                            {netWorth === 0 ? '0.0' : ((usdBalance / netWorth) * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-gray-500 text-xs">
                          $1.00
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center items-center space-x-2">
                            <button
                              onClick={() => {
                                setCashModalAction('deposit');
                                setIsCashModalOpen(true);
                              }}
                              className="text-xs font-bold text-[#0052FF] hover:underline cursor-pointer"
                            >
                              Deposit
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => {
                                setCashModalAction('withdraw');
                                setIsCashModalOpen(true);
                              }}
                              className="text-xs font-bold text-[#0052FF] hover:underline cursor-pointer"
                            >
                              Withdraw
                            </button>
                          </div>
                        </td>
                      </tr>

                      {holdings.map((hold) => {
                        const coin = coins.find((c) => c && c.symbol === hold.symbol);
                        if (!coin) return null;
                        const assetVal = hold.amount * coin.price;
                        const allocation = netWorth === 0 ? 0 : (assetVal / netWorth) * 100;

                        return (
                          <tr
                            key={hold.symbol}
                            className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                            onClick={() => {
                              setDetailCoin(coin);
                              setIsDetailOpen(true);
                            }}
                          >
                            <td className="px-6 py-4 font-semibold text-gray-900 flex items-center space-x-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs font-mono"
                                style={{ backgroundColor: coin.color }}
                              >
                                {coin.symbol.slice(0, 2)}
                              </div>
                              <div>
                                <div className="text-sm font-bold">{coin.name}</div>
                                <div className="text-xs text-gray-400 font-medium font-mono">{coin.symbol}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="text-sm font-bold text-gray-900 font-mono">
                                {hold.amount.toFixed(6)} {coin.symbol}
                              </div>
                              <div className="text-xs text-gray-400 font-medium font-mono">
                                ${assetVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs text-gray-500 font-mono font-semibold">
                                {allocation.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-gray-900 text-xs sm:text-sm">
                              ${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAssetSymbol(hold.symbol);
                                  setCurrentTab('dashboard');
                                  showToast(`Selected ${hold.symbol} terminal backing.`, 'info');
                                }}
                                className="text-xs font-bold text-[#0052FF] bg-blue-50 hover:bg-[#0052FF]/10 px-2.5 py-1.5 rounded-lg cursor-pointer"
                              >
                                Quick Backing
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Learning Reward Banner preview */}
              <div className="bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 rounded-2xl p-5 text-gray-900 flex flex-col sm:flex-row items-center justify-between shadow-xs gap-4 border border-yellow-300">
                <div className="flex items-center space-x-3 text-center sm:text-left flex-col sm:flex-row">
                  <Award className="h-10 w-10 text-white shrink-0 mb-2 sm:mb-0" />
                  <div>
                    <h4 className="font-extrabold text-sm sm:text-base">Claim $12 of Free Educational Crypto!</h4>
                    <p className="text-xs font-medium text-gray-800">Learn about blockchain scaling and oracles to claim free token rewards.</p>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentTab('learn')}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl cursor-pointer shadow-sm"
                >
                  Start Claiming
                </button>
              </div>

            </div>

            {/* Right Side Column: Onboarding, Trade widget, tips & static news */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Onboarding KYC verification progress checklist */}
              <OnboardingKyc
                onVerificationSuccess={(tier) => {
                  setKycLevel(tier);
                }}
                showToast={showToast}
              />

              {/* Sidebar Trade widget */}
              <TradeWidget
                coins={coins}
                holdings={holdings}
                usdBalance={usdBalance}
                onExecuteTrade={handleExecuteTrade}
                selectedAssetSymbol={selectedAssetSymbol}
              />

              {/* Coinbase News / Tips widget */}
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center space-x-1.5">
                  <Newspaper className="h-4 w-4 text-gray-400" />
                  <span>Coinbase Insights</span>
                </h4>
                
                <div className="space-y-4">
                  <div className="space-y-1 group cursor-pointer">
                    <span className="text-[10px] text-[#0052FF] font-semibold tracking-wider font-mono uppercase">VITALIK EXPLAINER</span>
                    <h5 className="text-xs sm:text-sm font-bold text-gray-900 group-hover:text-[#0052FF] transition-colors">
                      Ethereum rollups cut decentralized application network fees down by 95%
                    </h5>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      L2 protocols emerge as primary computing networks for smart contracts.
                    </p>
                  </div>

                  <div className="w-full h-px bg-gray-100" />

                  <div className="space-y-1 group cursor-pointer">
                    <span className="text-[10px] text-[#0052FF] font-semibold tracking-wider font-mono uppercase">SECURE SECURITY</span>
                    <h5 className="text-xs sm:text-sm font-bold text-gray-900 group-hover:text-[#0052FF] transition-colors">
                      Multi-signature wallet configuration instructions for cold assets
                    </h5>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Best-practice cryptographic setups for long-term crypto custody.
                    </p>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* --- Tab 2: Trade marketplace --- */}
        {currentTab === 'trade' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Wide Marketplace Table */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Markets Header Controls */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                
                {/* Search input */}
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search market tokens..."
                    value={marketSearchQuery}
                    onChange={(e) => setMarketSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 text-xs sm:text-sm pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>

                {/* Filter buttons */}
                <div className="flex bg-gray-100 p-1 rounded-xl self-stretch sm:self-auto overflow-x-auto">
                  {(['all', 'gainers', 'losers', 'watchlist'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setMarketFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-bold capitalize rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        marketFilter === filter
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {filter === 'all' ? 'All Assets' : filter}
                    </button>
                  ))}
                </div>

              </div>

              {/* Markets listings table */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 text-[10px] uppercase font-bold tracking-wider bg-gray-50/20">
                        <th className="px-6 py-3.5">Name</th>
                        <th className="px-6 py-3.5 text-right">Price</th>
                        <th className="px-6 py-3.5 text-right">Change (24h)</th>
                        <th className="px-6 py-3.5 text-right">Market Cap</th>
                        <th className="px-6 py-3.5 text-center">Watchlist</th>
                        <th className="px-6 py-3.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredCoinsTable.length > 0 ? (
                        filteredCoinsTable.map((coin) => {
                          const isCoinWatchlisted = watchlist.includes(coin.symbol);
                          const isCoinPositive = coin.change24h >= 0;

                          return (
                            <tr
                              key={coin.id}
                              className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                              onClick={() => {
                                setDetailCoin(coin);
                                setIsDetailOpen(true);
                              }}
                            >
                              {/* Coin Name */}
                              <td className="px-6 py-4 font-semibold text-gray-900 flex items-center space-x-3">
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs font-mono shrink-0"
                                  style={{ backgroundColor: coin.color }}
                                >
                                  {coin.symbol.slice(0, 2)}
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-gray-900">{coin.name}</div>
                                  <div className="text-xs text-gray-400 font-mono font-medium">{coin.symbol}</div>
                                </div>
                              </td>

                              {/* Price */}
                              <td className="px-6 py-4 text-right font-mono font-bold text-gray-900">
                                ${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>

                              {/* Change */}
                              <td
                                className={`px-6 py-4 text-right font-mono font-bold ${
                                  isCoinPositive ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {isCoinPositive ? '+' : ''}
                                {coin.change24h.toFixed(2)}%
                              </td>

                              {/* Market Cap */}
                              <td className="px-6 py-4 text-right text-xs text-gray-500 font-semibold font-mono">
                                ${coin.marketCap >= 1e12 ? `${(coin.marketCap / 1e12).toFixed(2)}T` : `${(coin.marketCap / 1e9).toFixed(1)}B`}
                              </td>

                              {/* Watchlist toggle */}
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleWatchlist(coin.symbol);
                                  }}
                                  className="p-1 hover:bg-gray-100 rounded-full text-gray-300 hover:text-yellow-500 transition-colors cursor-pointer"
                                >
                                  <Star className={`h-4 w-4 ${isCoinWatchlisted ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                                </button>
                              </td>

                              {/* Trade trigger */}
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAssetSymbol(coin.symbol);
                                    showToast(`Selected ${coin.symbol} inside exchange widget.`, 'info');
                                  }}
                                  className="text-xs font-bold text-[#0052FF] bg-blue-50 hover:bg-[#0052FF]/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  Trade
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                            No market assets match your filter or search query.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Sidebar Trade widget */}
            <div className="lg:col-span-4">
              <TradeWidget
                coins={coins}
                holdings={holdings}
                usdBalance={usdBalance}
                onExecuteTrade={handleExecuteTrade}
                selectedAssetSymbol={selectedAssetSymbol}
              />
            </div>

          </div>
        )}

        {/* --- Tab 3: Learning Rewards Hub --- */}
        {currentTab === 'learn' && (
          <div className="max-w-4xl mx-auto">
            <EarnRewards quizzes={quizzes} onCompleteQuiz={handleCompleteQuiz} />
          </div>
        )}

        {/* --- Tab: KYC Onboarding & Regional Limits --- */}
        {currentTab === 'onboarding' && (
          <div className="max-w-4xl mx-auto">
            <OnboardingKyc
              onVerificationSuccess={(level) => {
                setKycLevel(level);
                showToast(`KYC Onboarding complete! Level Upgraded to Tier ${level}.`, 'success');
              }}
              showToast={showToast}
            />
          </div>
        )}

        {/* --- Tab 4: Debit Card simulation --- */}
        {currentTab === 'card' && (
          <div className="max-w-5xl mx-auto">
            <CoinbaseCard
              holdings={holdings}
              coins={coins}
              onDebitCardSpend={handleDebitCardSpend}
            />
          </div>
        )}

        {/* --- Tab: Address Hub --- */}
        {currentTab === 'address' && (
          <div className="max-w-7xl mx-auto">
            <AddressHub
              coins={coins}
              holdings={holdings}
              onAddTransaction={(type, symbol, amount, fiat, details) => {
                const coin = coins.find((c) => c && c.symbol === symbol);
                if (!coin) return;
                
                // Track standard holdings addition if on-chain faucet credited
                setHoldings((prev) => {
                  const existing = prev.find((h) => h.symbol === symbol);
                  if (existing) {
                    const totalAmount = existing.amount + amount;
                    const weightedAvg = ((existing.amount * existing.avgBuyPrice) + (amount * coin.price)) / totalAmount;
                    return prev.map((h) =>
                      h.symbol === symbol ? { ...h, amount: totalAmount, avgBuyPrice: weightedAvg } : h
                    );
                  } else {
                    return [...prev, { symbol, amount, avgBuyPrice: coin.price }];
                  }
                });

                const tx: Transaction = {
                  id: `tx-chain-${Date.now()}`,
                  type: 'RECEIVE',
                  assetSymbol: symbol,
                  amount: amount,
                  fiatAmount: fiat,
                  timestamp: Date.now(),
                  details: details,
                  hash: `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
                  status: 'completed',
                  blockHeight: 849012 + Math.floor(Math.random() * 5000),
                  fromAddress: '0xfa839c0183...f9a8',
                  toAddress: symbol === 'ETH' ? '0x71C7656EC7ab88b098defB751B7401B5f6d1476B' : 'bc1q9rny26szrgl26u64mdg0cuhvpt2p77jwh792ka',
                  ledgerDebit: `Cryptocurrency Vault Holding (${symbol})`,
                  ledgerCredit: 'On-Chain Miner/Validator Coinbase'
                };
                setTransactions((prev) => [tx, ...prev]);
              }}
              showToast={showToast}
            />
          </div>
        )}

        {/* --- Tab: Developer Hub --- */}
        {currentTab === 'api' && (
          <div className="max-w-7xl mx-auto">
            <DeveloperHub
              coins={coins}
              holdings={holdings}
              usdBalance={usdBalance}
              showToast={showToast}
              onRefreshBalances={syncCoinbaseBalances}
            />
          </div>
        )}

        {/* --- Tab 5: Transaction History list --- */}
        {currentTab === 'history' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs max-w-4xl mx-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                <Clock className="h-4.5 w-4.5 text-gray-500" />
                <span>Account Activity Ledger</span>
              </h3>
              <span className="text-[10px] bg-slate-100 text-gray-500 font-bold px-2.5 py-0.5 rounded-full">
                {transactions.length} Records
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {transactions.length > 0 ? (
                transactions.map((tx) => {
                  const isPositiveTx = tx.type === 'RECEIVE' || tx.type === 'EARN';
                  const isConvert = tx.type === 'CONVERT';
                  const txDate = new Date(tx.timestamp).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  });

                  const isExpanded = expandedTxId === tx.id;

                  return (
                    <div key={tx.id} className="border-b border-gray-100 last:border-b-0">
                      <div
                        onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                        className="p-6 hover:bg-gray-50/50 transition-colors flex items-center justify-between cursor-pointer select-none"
                      >
                        <div className="flex items-center space-x-3.5">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 ${
                              isConvert
                                ? 'bg-amber-500'
                                : isPositiveTx
                                ? 'bg-green-600'
                                : 'bg-[#0052FF]'
                            }`}
                          >
                            {tx.type === 'BUY' && <ArrowUpRight className="h-5 w-5 rotate-90" />}
                            {tx.type === 'SELL' && <ArrowUpRight className="h-5 w-5" />}
                            {tx.type === 'SEND' && <ArrowUpRight className="h-5 w-5" />}
                            {tx.type === 'RECEIVE' && <ArrowDownLeft className="h-5 w-5" />}
                            {tx.type === 'EARN' && <Award className="h-5 w-5" />}
                            {tx.type === 'CONVERT' && <RefreshCw className="h-5 w-5" />}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-gray-900">
                                {tx.type} {tx.assetSymbol}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono font-medium">
                                {txDate}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 font-medium">{tx.details}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900 font-mono">
                              {isPositiveTx ? '+' : isConvert ? '' : '-'}
                              {tx.assetSymbol === 'USD' ? '' : `${tx.amount.toFixed(5)} `}
                              {tx.assetSymbol === 'USD' ? `$${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : tx.assetSymbol}
                            </p>
                            {tx.assetSymbol !== 'USD' && (
                              <p className="text-xs text-gray-400 font-mono mt-0.5">
                                ${tx.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                          <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {/* Expanded accounting ledger & hashcode details block */}
                      {isExpanded && (
                        <div className="px-6 pb-6 pt-2 bg-slate-50 border-t border-gray-100 text-xs text-gray-600 space-y-4 animate-slide-up">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            {/* Blockchain section */}
                            <div className="bg-white p-3.5 rounded-xl border border-gray-150 space-y-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">On-Chain Broadcast Details</span>
                              
                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">Status:</span>
                                <span className="col-span-2 text-gray-800 font-bold flex items-center text-[11px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                                  Broadcasted & Completed
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">Block Height:</span>
                                <span className="col-span-2 text-gray-700 font-mono font-semibold text-[11px]">
                                  #{tx.blockHeight || (841029 + Math.floor(Math.random() * 500))}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">Transaction Hash:</span>
                                <span className="col-span-2 text-gray-700 font-mono text-[10px] truncate select-all" title={tx.hash}>
                                  {tx.hash || '0x5fa3023e91da719c8f92bdc1b92c4310d7ef5b28'}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">On-Chain Path:</span>
                                <span className="col-span-2 text-gray-500 font-mono text-[10px] truncate">
                                  {tx.fromAddress ? `${tx.fromAddress.slice(0, 8)}...` : 'Coinbase Hot Vault'} ➔ {tx.toAddress ? `${tx.toAddress.slice(0, 8)}...` : 'User Ledger Wallet'}
                                </span>
                              </div>
                            </div>

                            {/* Financial Accounting section */}
                            <div className="bg-white p-3.5 rounded-xl border border-gray-150 space-y-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Double-Entry Audit Ledger</span>
                              
                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">Ledger Debit (Dr):</span>
                                <span className="col-span-2 text-blue-700 font-bold text-[11px]">
                                  {tx.ledgerDebit || `${tx.type === 'BUY' ? 'Asset Inventory Account' : 'Fiat Cash Ledger'} (${tx.assetSymbol})`}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">Ledger Credit (Cr):</span>
                                <span className="col-span-2 text-emerald-700 font-bold text-[11px]">
                                  {tx.ledgerCredit || `${tx.type === 'BUY' ? 'Cash Operational Reserve' : 'Asset Inventory Account'} (${tx.assetSymbol})`}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">Clearing Method:</span>
                                <span className="col-span-2 text-gray-700 font-semibold text-[11px]">
                                  {tx.type === 'SEND' || tx.type === 'RECEIVE' ? 'Blockchain Settlement Layer' : 'Instant Internal Settlement Engine'}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1">
                                <span className="text-[10px] text-gray-400 font-bold">Compliance Log:</span>
                                <span className="col-span-2 text-gray-500 text-[10px]">
                                  Authorized under FinCEN and FINTRAC regional regulations.
                                </span>
                              </div>
                            </div>

                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-12 text-center text-sm text-gray-500">
                  No account transaction activity recorded yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- Tab 6: Stripe Synchronization Hub --- */}
        {currentTab === 'stripe' && (
          <div className="max-w-4xl mx-auto space-y-8">
            {!isStripeConfigured && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start space-x-3.5 shadow-xs">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-800">Stripe Integration is Pending Configuration</h4>
                  <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                    To activate live balance synchronization and Connected Account bank payouts, please configure your <code>STRIPE_SECRET_KEY</code> inside your server environment settings.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center space-x-2">
                  <CreditCard className="h-5 w-5 text-[#635BFF]" />
                  <span>Stripe Synchronization Hub</span>
                </h3>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  Monitor your live Stripe account balance, auto-sync parameters, and execute connected account payouts.
                </p>
              </div>
              <button
                onClick={fetchStripeBalance}
                disabled={isFetchingStripeBalance}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetchingStripeBalance ? 'animate-spin' : ''}`} />
                <span>{isFetchingStripeBalance ? 'Syncing...' : 'Sync Balance Now'}</span>
              </button>
            </div>

            {/* Grid of Balances */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-xs">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Available Balance (CAD)</span>
                <span className="text-2xl font-black text-gray-900 mt-2 block font-mono">
                  ${stripeAvailable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-emerald-600 font-bold mt-1 block">Ready for Instant Payout</span>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-xs">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pending Balance (CAD)</span>
                <span className="text-2xl font-black text-gray-500 mt-2 block font-mono">
                  ${stripePending.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-gray-400 font-bold mt-1 block">Clearing in 1-2 Business Days</span>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-xs bg-slate-50/50">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Stripe Balance (CAD)</span>
                <span className="text-2xl font-black text-[#635BFF] mt-2 block font-mono">
                  ${stripeTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-gray-500 font-semibold mt-1 block">Synced to App Worth</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Sync Checklist / Rules */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">
                    🔄 Live Synchronization Rules
                  </h4>
                  
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 rounded-full bg-blue-50 text-[#0052FF] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        1
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-gray-900">USD Cash Balance Sync</h5>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed font-medium">
                          The <strong>USD Cash</strong> row in your Balances table displays your live Stripe balance. It updates automatically in the background.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 rounded-full bg-blue-50 text-[#0052FF] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        2
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-gray-900">Buy/Sell Trading Power</h5>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed font-medium">
                          The <strong>Cash</strong> balance inside the trading widget matches your Stripe balance state, meaning your live available purchasing power updates automatically.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 rounded-full bg-blue-50 text-[#0052FF] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        3
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-gray-900">Total Net Worth Calculation</h5>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed font-medium">
                          Your <strong>Total Net Worth (CAD)</strong> is calculated as the sum of USD Cash and active crypto balances. Any Stripe card deposits or bank payouts immediately update this figure.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Payout Portal */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">
                    💸 Connected Payout Portal
                  </h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                        Payout Amount (CAD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 font-extrabold text-xs">CA$</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={stripePayoutAmount}
                          onChange={(e) => setStripePayoutAmount(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#635BFF]"
                        />
                      </div>
                    </div>

                    {stripePayoutError && (
                      <div className="p-2.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-semibold flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{stripePayoutError}</span>
                      </div>
                    )}

                    {stripePayoutSuccess && (
                      <div className="p-2.5 bg-green-50 border border-green-100 rounded-xl text-green-700 text-xs font-semibold flex items-center space-x-2">
                        <Check className="h-4 w-4 shrink-0" />
                        <span>{stripePayoutSuccess}</span>
                      </div>
                    )}

                    <button
                      onClick={() => handleTriggerStripePayout(parseFloat(stripePayoutAmount))}
                      disabled={isProcessingStripePayout || !stripePayoutAmount || parseFloat(stripePayoutAmount) <= 0}
                      className="w-full bg-[#635BFF] hover:bg-[#4E46E5] text-white py-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-2 shadow-md shadow-indigo-500/10"
                    >
                      {isProcessingStripePayout ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Dispatching payout...</span>
                        </>
                      ) : (
                        <span>Initiate Connected Payout</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* --- Global Modals --- */}

      {/* Slide-out details sheets */}
      <AssetDetailModal
        coin={detailCoin}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailCoin(null);
        }}
        onSelectForTrade={(symbol) => {
          setSelectedAssetSymbol(symbol);
          setCurrentTab('dashboard');
        }}
        isWatchlisted={detailCoin ? watchlist.includes(detailCoin.symbol) : false}
        onToggleWatchlist={handleToggleWatchlist}
      />

      {/* Send and receive dialog */}
      <SendReceiveModal
        coins={coins}
        holdings={holdings}
        isOpen={isSendReceiveOpen}
        onClose={() => setIsSendReceiveOpen(false)}
        initialAction={sendReceiveAction}
        onExecuteTransaction={handleExecuteSendReceive}
      />

      {/* Cash Transfer (Deposit & Withdraw USD/CAD) dialog */}
      <CashTransferModal
        isOpen={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        usdBalance={usdBalance}
        onUpdateUsdBalance={setUsdBalance}
        onAddTransaction={(tx) => setTransactions((prev) => [tx, ...prev])}
        showToast={showToast}
        initialTab={cashModalAction}
        citizenship={(citizenship === 'CA' ? 'CA' : 'US') as 'US' | 'CA'}
        isAuthenticated={isAuthenticated}
        onTriggerEmail={(subject, fromName, fromEmail, bodyHtml) => {
          const newMail: InboxEmail = {
            id: `mail-${Date.now()}`,
            sender: fromName,
            senderEmail: fromEmail,
            subject,
            timestamp: Date.now(),
            bodyHtml,
            isRead: false
          };
          setEmails((prev) => [newMail, ...prev]);
          showToast('Transaction confirmation email dispatched!', 'info');
        }}
      />

      {/* Global Simulated Email Client Drawer */}
      <EmailInbox
        emails={emails}
        onReadEmail={(id) => {
          setEmails((prev) =>
            prev.map((e) => (e.id === id ? { ...e, isRead: true } : e))
          );
        }}
        onConfirmAction={handleConfirmEmailAction}
        userEmail={userEmail}
        isOpen={isEmailInboxOpen}
        setIsOpen={setIsEmailInboxOpen}
      />
    </div>
  );
}
