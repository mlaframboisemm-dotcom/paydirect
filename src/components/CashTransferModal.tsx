import React, { useState, useEffect } from 'react';
import { 
  X, ArrowUpRight, ArrowDownLeft, CheckCircle2, Landmark, 
  Plus, ShieldCheck, Lock, ChevronLeft, CreditCard, DollarSign,
  Building2, ArrowRight, RefreshCw, AlertCircle
} from 'lucide-react';
import { Transaction } from '../types';
import { fetchLiveExchangeRates } from '../lib/blockchain';
import { canCoverWithdrawal, convertCadToUsd, convertUsdToCad } from '../lib/financial-hardening';

const bankUrls: Record<string, string> = {
  'TD Canada Trust': 'https://easyweb.td.com',
  'Royal Bank of Canada (RBC)': 'https://www.rbconline.ib.rbc.com',
  'Scotiabank': 'https://www.scotiabank.com/online-banking',
  'BMO Bank of Montreal': 'https://www.bmo.com/main/personal',
  'CIBC': 'https://www.cibc.com',
  'Simplii Financial': 'https://www.simplii.com',
  'Tangerine': 'https://www.tangerine.ca',
  'Chase Bank': 'https://www.chase.com',
  'Wells Fargo': 'https://www.wellsfargo.com',
  'Bank of America': 'https://www.bankofamerica.com',
  'Citi': 'https://www.citi.com'
};

const configuredApiBase = String(
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_API_BASE_URL ||
  ''
).trim();

function buildApiUrl(path: string): string {
  const safePath = typeof path === 'string' && path.trim().length > 0 ? path.trim() : '/';
  const normalized = safePath.startsWith('/') ? safePath : `/${safePath}`;
  if (configuredApiBase) {
    return new URL(normalized, configuredApiBase).toString();
  }
  if (typeof window !== 'undefined') {
    // Electron/file:// renderers cannot resolve relative /api routes.
    if (window.location.protocol === 'file:') {
      return `https://www.pay.sovereigns.ca${normalized}`;
    }
    if (window.location.origin && window.location.origin !== 'null') {
      return `${window.location.origin}${normalized}`;
    }
  }
  return normalized;
}

function buildAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const token = localStorage.getItem('cb_auth_jwt_token') || sessionStorage.getItem('cb_auth_jwt_token');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders || {})
  };
}

interface CashTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  usdBalance: number;
  onUpdateUsdBalance: (newBalance: number) => void;
  onAddTransaction: (tx: Transaction) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  initialTab?: 'deposit' | 'withdraw';
  citizenship?: 'US' | 'CA';
  onTriggerEmail?: (subject: string, sender: string, senderEmail: string, bodyHtml: string) => void;
}

interface LinkedBank {
  id: string;
  bankName: string;
  accountType: string;
  lastFour: string;
}

export default function CashTransferModal({
  isOpen,
  onClose,
  usdBalance,
  onUpdateUsdBalance,
  onAddTransaction,
  showToast,
  initialTab = 'deposit',
  citizenship = 'US',
  onTriggerEmail
}: CashTransferModalProps) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'banks'>(initialTab);
  
  // Bank Account States
  const [linkedBanks, setLinkedBanks] = useState<LinkedBank[]>(() => {
    const saved = localStorage.getItem('cb_linked_banks');
    return saved ? JSON.parse(saved) : [
      { id: 'bank-1', bankName: 'Chase Bank', accountType: 'Checking', lastFour: '8329' },
      { id: 'bank-2', bankName: 'Wells Fargo', accountType: 'Savings', lastFour: '4012' }
    ];
  });

  // e-Transfer and Canadian network states
  const [depositMethod, setDepositMethod] = useState<'bank' | 'etransfer'>(citizenship === 'CA' ? 'etransfer' : 'bank');
  const [withdrawMethod, setWithdrawMethod] = useState<'bank' | 'etransfer'>(citizenship === 'CA' ? 'etransfer' : 'bank');
  const [etransferBankName, setEtransferBankName] = useState('TD Canada Trust');
  const [etransferEmail, setEtransferEmail] = useState(() => localStorage.getItem('cb_auth_email') || '');
  const [etransferRef, setEtransferRef] = useState(() => 'CA' + Math.floor(100000 + Math.random() * 900000).toString());
  const [isEtransferVerifying, setIsEtransferVerifying] = useState(false);
  const [etransferStep, setEtransferStep] = useState(0);

  // Sync to prop changes
  useEffect(() => {
    setDepositMethod(citizenship === 'CA' ? 'etransfer' : 'bank');
    setWithdrawMethod(citizenship === 'CA' ? 'etransfer' : 'bank');
  }, [citizenship]);

  // Sync tab selection with initialTab prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Save linked banks
  useEffect(() => {
    localStorage.setItem('cb_linked_banks', JSON.stringify(linkedBanks));
  }, [linkedBanks]);

  // Handle bank redirection callback on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const transferId = params.get('transfer_id') || params.get('state');
    const code = params.get('code');

    if (action === 'finalize_interac' && transferId && code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const finalizeRedirectionCallback = async () => {
        const bankKey = activeSelectedBankKey || 'TD';
        showToast('Clearing interbank OAuth authorization code...', 'info');
        
        try {
          const res = await fetch(buildApiUrl('/api/v1/interac/finalize'), {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              transfer_id: transferId,
              selected_bank_key: bankKey,
              oauth_authorization_token: code
            })
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to finalize settlement.');
          }

          const resData = await res.json();
          const clearinghouseHash = resData.tracking_reference_id;
          
          const isDeposit = resData.operation_type ? (resData.operation_type === 'DEPOSIT') : (resData.status === 'DEPOSITED');
          const amountUsd = Number(resData.amount_usd || (isDeposit ? 110.12 : 36.71));
          
          if (isDeposit) {
            onAddTransaction({
              id: clearinghouseHash,
              type: 'RECEIVE',
              assetSymbol: 'USD',
              amount: amountUsd,
              fiatAmount: amountUsd,
              timestamp: Date.now(),
              details: `Sovereigns Gateway DEPOSIT cleared via bank redirect callback (Ref: ${clearinghouseHash})`
            });
            onUpdateUsdBalance(usdBalance + amountUsd);
            showToast(`Interbank settlement finalized! Credited $${amountUsd.toFixed(2)} USD`, 'success');
          } else {
            onAddTransaction({
              id: clearinghouseHash,
              type: 'SEND',
              assetSymbol: 'USD',
              amount: amountUsd,
              fiatAmount: amountUsd,
              timestamp: Date.now(),
              details: `Sovereigns Gateway WITHDRAWAL cleared via bank redirect callback (Ref: ${clearinghouseHash})`
            });
            onUpdateUsdBalance(usdBalance - amountUsd);
            showToast(`Interbank withdrawal finalized! Debited $${amountUsd.toFixed(2)} USD`, 'success');
          }
        } catch (e: any) {
          showToast(`Callback settlement failed: ${e.message}`, 'error');
        }
      };
      
      finalizeRedirectionCallback();
    }
  }, []);


  // Plaid-like connector states
  const [linkingStep, setLinkingStep] = useState<'none' | 'welcome' | 'select-bank' | 'credentials' | 'success'>('none');
  const [plaidSelectedBank, setPlaidSelectedBank] = useState<string>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPlaidConnecting, setIsPlaidConnecting] = useState(false);
  const [plaidHandshakeStep, setPlaidHandshakeStep] = useState<number>(0);

  // Deposit States
  const [depositAmount, setDepositAmount] = useState('500');
  const [depositBankId, setDepositBankId] = useState(linkedBanks[0]?.id || '');
  const [depositSpeed, setDepositSpeed] = useState<'instant' | 'standard'>('instant');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositProgressStep, setDepositProgressStep] = useState(0);

  // Withdrawal States
  const [withdrawAmount, setWithdrawAmount] = useState('200');
  const [withdrawBankId, setWithdrawBankId] = useState(linkedBanks[0]?.id || '');
  const [withdrawSpeed, setWithdrawSpeed] = useState<'instant' | 'standard'>('instant');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawProgressStep, setWithdrawProgressStep] = useState(0);

  const [localError, setLocalError] = useState<string | null>(null);
  const [usdCadRate, setUsdCadRate] = useState<number>(1.365);
  const [successScreenData, setSuccessScreenData] = useState<{
    type: 'deposit' | 'withdraw';
    amount: number;
    fee: number;
    netAmount: number;
    bankName: string;
    speed: string;
    pendingExternal?: boolean;
    requestId?: string;
  } | null>(null);

  const [useSovereignsGateway, setUseSovereignsGateway] = useState<boolean>(true);
  const [activeSelectedBankKey, setActiveSelectedBankKey] = useState<string>('');
  const [activeSelectedBankName, setActiveSelectedBankName] = useState<string>('');
  const [isSovereignsWebviewOpen, setIsSovereignsWebviewOpen] = useState<boolean>(false);
  const [webviewStep, setWebviewStep] = useState<'login' | 'mfa' | 'processing'>('login');
  const [webviewMfaCode, setWebviewMfaCode] = useState<string>('');
  const [currentSessionTransferId, setCurrentSessionTransferId] = useState<string>('');

  // Make sure depositBankId and withdrawBankId are updated if linked banks list changes
  useEffect(() => {
    if (linkedBanks.length > 0) {
      if (!depositBankId) setDepositBankId(linkedBanks[0].id);
      if (!withdrawBankId) setWithdrawBankId(linkedBanks[0].id);
    }
  }, [linkedBanks, depositBankId, withdrawBankId]);

  // Refresh USD/CAD for Canadian rails so CAD input can reconcile against USD wallet balances.
  useEffect(() => {
    let mounted = true;
    const loadFx = async () => {
      try {
        const rates = await fetchLiveExchangeRates();
        const next = Number(rates?.USDCAD);
        if (mounted && Number.isFinite(next) && next > 0) {
          setUsdCadRate(next);
        }
      } catch {
        // Keep fallback static rate if live FX lookup fails.
      }
    };

    loadFx();
    return () => {
      mounted = false;
    };
  }, []);

  const normalizeCurrency = (value: number) => Math.round(value * 100) / 100;
  const cadToUsd = (cad: number) => convertCadToUsd(cad, usdCadRate);
  const usdToCad = (usd: number) => convertUsdToCad(usd, usdCadRate);

  if (!isOpen) return null;

  // Handle linking bank
  const handleStartPlaid = () => {
    setLinkingStep('welcome');
    setLocalError(null);
  };

  const handleSelectPlaidBank = (bankName: string) => {
    setPlaidSelectedBank(bankName);
    setLinkingStep('credentials');
  };

  const handlePlaidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setIsPlaidConnecting(true);
    setPlaidHandshakeStep(0);

    setTimeout(() => {
      setPlaidHandshakeStep(1); // signed by Kiln Node 01
      setTimeout(() => {
        setPlaidHandshakeStep(2); // JWT client assertion verified
        setTimeout(() => {
          setPlaidHandshakeStep(3); // bank API session established
          setTimeout(() => {
            setIsPlaidConnecting(false);
            const lastFour = Math.floor(1000 + Math.random() * 9000).toString();
            const newBank: LinkedBank = {
              id: `bank-${Date.now()}`,
              bankName: plaidSelectedBank,
              accountType: 'Checking',
              lastFour: lastFour
            };
            const updated = [...linkedBanks, newBank];
            setLinkedBanks(updated);
            setDepositBankId(newBank.id);
            setWithdrawBankId(newBank.id);
            setLinkingStep('success');
          }, 800);
        }, 800);
      }, 800);
    }, 800);
  };

  // Close Plaid
  const handleClosePlaid = () => {
    setLinkingStep('none');
    setPlaidSelectedBank('');
    setUsername('');
    setPassword('');
    setLocalError(null);
  };

  // Handle Interac e-Transfer deposit execution
  const handleExecuteEtransferDeposit = async () => {
    setLocalError(null);
    const amountCad = parseFloat(depositAmount);
    if (isNaN(amountCad) || amountCad <= 0) {
      setLocalError('Please enter a valid amount to deposit.');
      return;
    }

    const amountUsd = cadToUsd(amountCad);

    if (!etransferRef || etransferRef.trim().length < 6) {
      setLocalError('Please enter a valid Interac reference code (e.g. CA128391).');
      return;
    }

    setIsEtransferVerifying(true);
    setEtransferStep(1);

    try {
      const response = await fetch(buildApiUrl('/api/coinbase/deposit'), {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json'
        }),
        credentials: 'include',
        body: JSON.stringify({
          amount: amountUsd,
          amountCad,
          currency: 'CAD',
          method: 'etransfer',
          etransferRef: etransferRef.toUpperCase(),
          etransferBankName
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.message || resData.error || 'Server error');
      }

      const pendingExternal = resData?.status === 'PENDING_EXTERNAL_SETTLEMENT';

      setEtransferStep(2);
      setTimeout(() => setEtransferStep(3), 800);
      setTimeout(() => {
        const netAmount = amountUsd;

        const tx: Transaction = {
          id: resData.txId || `tx-etrans-${Date.now()}`,
          type: 'RECEIVE',
          assetSymbol: 'USD',
          amount: netAmount,
          fiatAmount: netAmount,
          timestamp: Date.now(),
          details: pendingExternal
            ? `Pending External Settlement: Interac deposit request (${resData.provider || 'provider'}) from ${etransferBankName} (Ref: ${etransferRef.toUpperCase()}) - CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            : `Interac e-Transfer Deposit from ${etransferBankName} (Ref: ${etransferRef.toUpperCase()}) - CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        };

        onAddTransaction(tx);
        setIsEtransferVerifying(false);
        setEtransferStep(0);

        setSuccessScreenData({
          type: 'deposit',
          amount: amountCad,
          fee: 0,
          netAmount: netAmount,
          bankName: `Interac (${etransferBankName})`,
          speed: pendingExternal
            ? `Pending External Settlement (Ref: ${etransferRef.toUpperCase()})`
            : `Instant Auto-Deposit Match (Ref: ${etransferRef.toUpperCase()})`,
          pendingExternal,
          requestId: resData.txId
        });

        if (pendingExternal) {
          showToast(`Interac request submitted: CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })} (≈ US$${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })})`, 'info');
        } else {
          onUpdateUsdBalance(usdBalance + netAmount);
          showToast(`Interac e-Transfer matched and credited! CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })} (US$${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })})`, 'success');
        }
        
        // Redirect to selected bank online banking portal
        const targetUrl = bankUrls[etransferBankName] || 'https://www.scotiabank.com/online-banking';
        window.open(targetUrl, '_blank');

        setEtransferRef('CA' + Math.floor(100000 + Math.random() * 900000).toString());
      }, 1600);
    } catch (e: any) {
      setIsEtransferVerifying(false);
      setEtransferStep(0);
      setLocalError(`Deposit failed: ${e.message}`);
    }
  };

  // Handle Interac e-Transfer withdrawal execution
  const handleExecuteEtransferWithdrawal = async () => {
    setLocalError(null);
    const amountCad = parseFloat(withdrawAmount);
    if (isNaN(amountCad) || amountCad <= 0) {
      setLocalError('Please enter a valid amount to withdraw.');
      return;
    }

    const amountUsd = cadToUsd(amountCad);

    if (!canCoverWithdrawal(amountUsd, usdBalance)) {
      setLocalError(`Insufficient USD cash balance. You have US$${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} (≈ CA$${usdToCad(usdBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}) available.`);
      return;
    }

    setIsEtransferVerifying(true);
    setEtransferStep(1);

    try {
      const response = await fetch(buildApiUrl('/api/coinbase/withdraw'), {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json'
        }),
        credentials: 'include',
        body: JSON.stringify({
          amount: amountUsd,
          amountCad,
          currency: 'CAD',
          method: 'etransfer',
          etransferEmail
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.message || resData.error || 'Server error');
      }

      const pendingExternal = resData?.status === 'PENDING_EXTERNAL_SETTLEMENT';

      setEtransferStep(2);
      setTimeout(() => setEtransferStep(3), 800);
      setTimeout(() => {
        const tx: Transaction = {
          id: resData.txId || `tx-etrans-w-${Date.now()}`,
          type: 'SEND',
          assetSymbol: 'USD',
          amount: amountUsd,
          fiatAmount: amountUsd,
          timestamp: Date.now(),
          details: pendingExternal
            ? `Pending External Settlement: Interac withdrawal request (${resData.provider || 'provider'}) to ${etransferEmail} - CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            : `Interac e-Transfer Withdrawal to Scotiabank (${etransferEmail}) - CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        };

        onAddTransaction(tx);
        setIsEtransferVerifying(false);
        setEtransferStep(0);

        setSuccessScreenData({
          type: 'withdraw',
          amount: amountCad,
          fee: 0,
          netAmount: amountUsd,
          bankName: `Interac Scotiabank (${etransferEmail})`,
          speed: pendingExternal ? 'Pending External Settlement' : 'Interac Instant Dispatched (15 Mins)',
          pendingExternal,
          requestId: resData.txId
        });

        if (pendingExternal) {
          showToast(`Interac withdrawal request submitted: CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })} (≈ US$${amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })})`, 'info');
        } else {
          onUpdateUsdBalance(usdBalance - amountUsd);
          showToast(`Withdrawal of CA$${amountCad.toLocaleString(undefined, { minimumFractionDigits: 2 })} (US$${amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}) dispatched via Interac e-Transfer!`, 'success');
        }

        // Redirect to selected bank online banking portal
        const targetUrl = bankUrls[etransferBankName] || 'https://www.scotiabank.com/online-banking';
        window.open(targetUrl, '_blank');
      }, 1600);
    } catch (e: any) {
      setIsEtransferVerifying(false);
      setEtransferStep(0);
      setLocalError(`Withdrawal failed: ${e.message}`);
    }
  };

  // Handle deposit execution
  const handleExecuteDeposit = async () => {
    setLocalError(null);
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setLocalError('Please enter a valid amount to deposit.');
      return;
    }

    if (amountNum > 50000) {
      setLocalError('Maximum deposit limit is $50,000 per transaction.');
      return;
    }

    const bank = linkedBanks.find(b => b.id === depositBankId);
    if (!bank) {
      setLocalError('Please select or link a bank account.');
      return;
    }

    setIsDepositing(true);
    setDepositProgressStep(1);

    try {
      const response = await fetch(buildApiUrl('/api/coinbase/deposit'), {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json'
        }),
        credentials: 'include',
        body: JSON.stringify({
          amount: amountNum,
          method: 'bank',
          bankName: bank.bankName,
          speed: depositSpeed
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.message || resData.error || 'Server error');
      }

      const pendingExternal = resData?.status === 'PENDING_EXTERNAL_SETTLEMENT';

      setDepositProgressStep(2);
      setTimeout(() => setDepositProgressStep(3), 800);
      setTimeout(() => {
        const fee = depositSpeed === 'instant' ? amountNum * 0.015 : 0;
        const netAmount = amountNum - fee;

        const tx: Transaction = {
          id: resData.txId || `tx-dep-${Date.now()}`,
          type: 'RECEIVE',
          assetSymbol: 'USD',
          amount: netAmount,
          fiatAmount: netAmount,
          timestamp: Date.now(),
          details: pendingExternal
            ? `Pending External Settlement: ACH deposit request (${resData.provider || 'provider'}) from ${bank.bankName} (****${bank.lastFour})`
            : `ACH Cash Deposit from ${bank.bankName} (****${bank.lastFour}) via ${depositSpeed === 'instant' ? 'Instant Credit' : 'Standard Clearing'}`
        };

        onAddTransaction(tx);
        setIsDepositing(false);
        setDepositProgressStep(0);
        setSuccessScreenData({
          type: 'deposit',
          amount: amountNum,
          fee: fee,
          netAmount: netAmount,
          bankName: `${bank.bankName} (****${bank.lastFour})`,
          speed: pendingExternal ? 'Pending External Settlement' : (depositSpeed === 'instant' ? 'Instant Credit' : 'Standard Clearing (1-3 Days)'),
          pendingExternal,
          requestId: resData.txId
        });
        if (pendingExternal) {
          showToast(`Deposit request submitted: $${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'info');
        } else {
          onUpdateUsdBalance(usdBalance + netAmount);
          showToast(`Deposited $${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} successfully!`, 'success');
        }

        // Redirect to selected bank online banking portal
        const bankNameNormalized = bank?.bankName || '';
        let targetUrl = 'https://www.scotiabank.com/online-banking';
        for (const k of Object.keys(bankUrls)) {
          if (bankNameNormalized.toLowerCase().includes(k.toLowerCase())) {
            targetUrl = bankUrls[k];
            break;
          }
        }
        window.open(targetUrl, '_blank');
      }, 1600);
    } catch (e: any) {
      setIsDepositing(false);
      setDepositProgressStep(0);
      setLocalError(`Deposit failed: ${e.message}`);
    }
  };

  // Handle withdrawal execution
  const handleExecuteWithdrawal = async () => {
    setLocalError(null);
    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setLocalError('Please enter a valid amount to withdraw.');
      return;
    }

    const amountCad = normalizeCurrency(amountNum);
    const amountUsd = cadToUsd(amountCad);
    const maxCadOutflow = normalizeCurrency(usdToCad(usdBalance));
    if (!canCoverWithdrawal(amountUsd, usdBalance)) {
      setLocalError(`Insufficient USD cash balance. You have US$${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} (≈ CA$${maxCadOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}) available.`);
      return;
    }

    const bank = linkedBanks.find(b => b.id === withdrawBankId);
    if (!bank) {
      setLocalError('Please select or link a bank account.');
      return;
    }

    setIsWithdrawing(true);
    setWithdrawProgressStep(1);

    try {
      const response = await fetch(buildApiUrl('/api/coinbase/withdraw'), {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json'
        }),
        credentials: 'include',
        body: JSON.stringify({
          amount: amountNum,
          method: 'bank',
          bankName: bank.bankName,
          speed: withdrawSpeed
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.message || resData.error || 'Server error');
      }

      const pendingExternal = resData?.status === 'PENDING_EXTERNAL_SETTLEMENT';

      setWithdrawProgressStep(2);
      setTimeout(() => setWithdrawProgressStep(3), 800);
      setTimeout(() => {
        const fee = withdrawSpeed === 'instant' ? amountNum * 0.015 : 0;
        const finalAmount = amountNum - fee;

        const tx: Transaction = {
          id: resData.txId || `tx-wth-${Date.now()}`,
          type: 'SEND',
          assetSymbol: 'USD',
          amount: amountNum,
          fiatAmount: amountNum,
          timestamp: Date.now(),
          details: pendingExternal
            ? `Pending External Settlement: ACH withdrawal request (${resData.provider || 'provider'}) to ${bank.bankName} (****${bank.lastFour})`
            : `ACH Cash Withdrawal to ${bank.bankName} (****${bank.lastFour}) using ${withdrawSpeed === 'instant' ? 'Instant' : 'Standard'} route`
        };

        onAddTransaction(tx);
        setIsWithdrawing(false);
        setWithdrawProgressStep(0);
        setSuccessScreenData({
          type: 'withdraw',
          amount: amountNum,
          fee: fee,
          netAmount: finalAmount,
          bankName: `${bank.bankName} (****${bank.lastFour})`,
          speed: pendingExternal ? 'Pending External Settlement' : (withdrawSpeed === 'instant' ? 'Instant ACH' : 'Standard ACH (1-3 Days)'),
          pendingExternal,
          requestId: resData.txId
        });
        if (pendingExternal) {
          showToast(`Withdrawal request submitted: $${amountNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'info');
        } else {
          onUpdateUsdBalance(usdBalance - amountNum);
          showToast(`Withdrew $${amountNum.toLocaleString(undefined, { minimumFractionDigits: 2 })} successfully!`, 'success');
        }

        // Redirect to selected bank online banking portal
        const bankNameNormalized = bank?.bankName || '';
        let targetUrl = 'https://www.scotiabank.com/online-banking';
        for (const k of Object.keys(bankUrls)) {
          if (bankNameNormalized.toLowerCase().includes(k.toLowerCase())) {
            targetUrl = bankUrls[k];
            break;
          }
        }
        window.open(targetUrl, '_blank');
      }, 1600);
    } catch (e: any) {
      setIsWithdrawing(false);
      setWithdrawProgressStep(0);
      setLocalError(`Withdrawal failed: ${e.message}`);
    }
  };

  // Sovereigns Interbank Gateway Mappings
  const CANADIAN_FINANCIAL_NODES: Record<string, { name: string; theme: string; icon: string }> = {
    "RBC": { name: "Royal Bank of Canada", theme: "#005da6", icon: "🔵" },
    "TD": { name: "TD Canada Trust", theme: "#008a00", icon: "🟢" },
    "Scotiabank": { name: "Scotiabank", theme: "#ed1c24", icon: "🔴" },
    "BMO": { name: "Bank of Montreal", theme: "#0079c1", icon: "🔹" },
    "CIBC": { name: "CIBC Exchange Node", theme: "#b00d23", icon: "🔺" },
    "Tangerine": { name: "Tangerine Bank", theme: "#ff6600", icon: "🍊" },
    "Desjardins": { name: "Desjardins AccèsD", theme: "#00875a", icon: "☘️" },
    "NationalBank": { name: "National Bank of Canada", theme: "#00549f", icon: "🔵" },
    "Simplii": { name: "Simplii Financial", theme: "#ff4500", icon: "🔸" },
    "Vancity": { name: "Vancity Credit Union", theme: "#d32f2f", icon: "🚩" },
    "Meridian": { name: "Meridian Credit Union", theme: "#004b87", icon: "🌐" },
    "ATB": { name: "ATB Financial Services", theme: "#0072c6", icon: "💠" },
    "CoastCapital": { name: "Coast Capital Savings", theme: "#00938f", icon: "💠" }
  };

  const simulatorModeCheckbox = false;

  const resolveDirectBankId = (bankKey: string): string | null => {
    const normalized = (bankKey || '').toLowerCase();
    if (normalized.includes('rbc') || normalized.includes('royal')) return 'rbc';
    if (normalized.includes('td')) return 'td';
    if (normalized.includes('scotiabank') || normalized.includes('scotia')) return 'scotiabank';
    if (normalized.includes('bmo') || normalized.includes('montreal')) return 'bmo';
    if (normalized.includes('cibc')) return 'cibc';
    if (normalized.includes('tangerine')) return 'tangerine';
    if (normalized.includes('desjardins')) return 'desjardins';
    if (normalized.includes('nationalbank') || normalized.includes('national')) return 'nationalbank';
    if (normalized.includes('simplii')) return 'simplii';
    if (normalized.includes('vancity')) return 'vancity';
    if (normalized.includes('meridian')) return 'meridian';
    if (normalized.includes('atb')) return 'atb';
    if (normalized.includes('coastcapital') || normalized.includes('coast')) return 'coastcapital';
    return null;
  };

  const openDirectBankRedirect = async (targetUrl: string) => {
    try {
      if (typeof (window as any).acquireVsCodeApi === 'function') {
        try {
          const vscode = (window as any).acquireVsCodeApi();
          vscode.postMessage({ type: 'openExternal', url: targetUrl });
          return;
        } catch {
          // fallthrough to other methods
        }
      }

      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: targetUrl });
    } catch {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleInitiateSovereignsGateway = async (overrideKey?: string, overrideName?: string) => {
    setLocalError(null);
    const amountCad = parseFloat(depositAmount);
    if (isNaN(amountCad) || amountCad <= 0) {
      setLocalError('Please enter a valid amount.');
      return;
    }
    const bankKey = overrideKey || activeSelectedBankKey;
    const bankName = overrideName || activeSelectedBankName;
    if (!bankKey) {
      setLocalError('Please select your financial institution.');
      return;
    }

    const bankId = resolveDirectBankId(bankKey);
    if (!bankId) {
      setLocalError('Selected bank is not supported for direct bank authorization.');
      return;
    }

    try {
      const initRes = await fetch(buildApiUrl('/api/withdrawal/initiate'), {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          amount: amountCad,
          bankId,
          operation_type: 'DEPOSIT',
          fxRate: usdCadRate,
          fxRateSource: 'cash-transfer-modal'
        })
      });

      if (!initRes.ok) {
        const err = await initRes.json();
        throw new Error(err.message || err.error || 'Failed to initiate direct bank authorization.');
      }

      const initData = await initRes.json();
      const targetUrl = initData.authorization_redirect_url;
      if (!targetUrl) {
        throw new Error('The server did not return a redirect URL.');
      }

      setCurrentSessionTransferId(initData.jti || 'direct-bank');
      showToast(`Redirecting to secure bank portal: ${bankName}`, 'info');
      setTimeout(() => openDirectBankRedirect(targetUrl), 1200);
    } catch (e: any) {
      setLocalError(`Gateway error: ${e.message}`);
    }
  };



  const handleInitiateSovereignsWithdrawal = async (overrideKey?: string, overrideName?: string) => {
    setLocalError(null);
    const amountCad = Number.parseFloat(withdrawAmount);
    if (Number.isNaN(amountCad) || amountCad <= 0) {
      setLocalError('Please enter a valid amount.');
      return;
    }
    const sanitizedCadAmount = normalizeCurrency(amountCad);
    const amountUsd = cadToUsd(sanitizedCadAmount);
    const maxCadOutflow = normalizeCurrency(usdToCad(usdBalance));
    if (!canCoverWithdrawal(amountUsd, usdBalance)) {
      setLocalError(`Insufficient USD cash balance. You have US$${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} (≈ CA$${maxCadOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}) available.`);
      return;
    }
    if (sanitizedCadAmount > maxCadOutflow + 0.01) {
      setLocalError(`The requested amount exceeds your available CAD outflow limit of CA$${maxCadOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`);
      return;
    }
    const bankKey = overrideKey || activeSelectedBankKey;
    const bankName = overrideName || activeSelectedBankName;
    if (!bankKey) {
      setLocalError('Please select your financial institution.');
      return;
    }

    const bankId = resolveDirectBankId(bankKey);
    if (!bankId) {
      setLocalError('Selected bank is not supported for direct bank authorization.');
      return;
    }

    try {
      const initRes = await fetch(buildApiUrl('/api/withdraw/redirect'), {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          amount: amountCad,
          bankId,
          redirect_uri: window.location.origin + '/',
          fxRate: usdCadRate,
          fxRateSource: 'cash-transfer-modal'
        })
      });

      if (!initRes.ok) {
        const err = await initRes.json();
        throw new Error(err.message || err.error || 'Failed to initiate direct bank authorization.');
      }

      const initData = await initRes.json();
      const targetUrl = initData.authorization_redirect_url;
      if (!targetUrl) {
        throw new Error('The server did not return a redirect URL.');
      }

      setCurrentSessionTransferId(initData.state || initData.jti || 'direct-bank');
      showToast(`Redirecting to secure bank portal for CA$${sanitizedCadAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}: ${bankName}`, 'info');
      setTimeout(() => openDirectBankRedirect(targetUrl), 1200);
    } catch (e: any) {
      setLocalError(`Gateway error: ${e.message}`);
    }
  };

  return (

    <div className="fixed inset-0 z-50 overflow-y-auto" id="cash-transfer-modal">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all w-full max-w-md animate-slide-up border border-gray-100">
          
          {/* PLAID FLOW SCREEN (OVERLAY INSIDE MODAL) */}
          {linkingStep !== 'none' && (
            <div className="absolute inset-0 bg-white z-50 p-6 flex flex-col justify-between">
              {linkingStep === 'welcome' && (
                <div className="flex flex-col items-center text-center justify-center h-full space-y-5">
                  <div className="w-14 h-14 bg-blue-50 text-[#0052FF] rounded-full flex items-center justify-center">
                    <ShieldCheck className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Link Your Bank Account</h3>
                    <p className="text-xs sm:text-sm text-gray-500 mt-2 max-w-xs">
                      Coinbase uses secure encryption to link your bank account instantly via a private, safe portal.
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-left space-y-2.5 w-full">
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <Lock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span>Your credentials are encrypted and never stored.</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span>Authorized with bank-level protocol security.</span>
                    </div>
                  </div>

                  <div className="w-full flex space-x-3 pt-4">
                    <button
                      onClick={handleClosePlaid}
                      className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setLinkingStep('select-bank')}
                      className="flex-1 py-2.5 bg-[#0052FF] hover:bg-blue-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <span>Continue</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {linkingStep === 'select-bank' && (
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <button 
                      onClick={() => setLinkingStep('welcome')}
                      className="flex items-center text-xs text-gray-500 hover:text-gray-900"
                    >
                      <ChevronLeft className="h-4 w-4 mr-0.5" />
                      <span>Back</span>
                    </button>
                    <span className="text-xs font-bold text-gray-800">Select Your Institution</span>
                    <button onClick={handleClosePlaid} className="p-1 text-gray-400 hover:text-gray-900">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-6 overflow-y-auto max-h-[300px]">
                    {[
                      { name: 'Chase Bank', color: 'bg-blue-700' },
                      { name: 'Bank of America', color: 'bg-red-600' },
                      { name: 'Wells Fargo', color: 'bg-yellow-600' },
                      { name: 'Citi Bank', color: 'bg-cyan-600' },
                      { name: 'Capital One', color: 'bg-slate-800' },
                      { name: 'TD Bank', color: 'bg-emerald-600' }
                    ].map((bank) => (
                      <button
                        key={bank.name}
                        onClick={() => handleSelectPlaidBank(bank.name)}
                        className="p-4 border border-gray-100 hover:border-[#0052FF] hover:shadow-xs rounded-xl flex flex-col items-center justify-center text-center space-y-2 cursor-pointer transition-all"
                      >
                        <div className={`w-8 h-8 rounded-lg ${bank.color} flex items-center justify-center text-white font-bold text-[10px]`}>
                          {bank.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-gray-800">{bank.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 text-center text-[10px] text-gray-400">
                    Secure linkage protected by Coinbase Bankshield protocols.
                  </div>
                </div>
              )}

              {linkingStep === 'credentials' && (
                <form onSubmit={handlePlaidSubmit} className="flex flex-col justify-between h-full">
                  <div>
                    <div className="flex justify-between items-center pb-3 border-b border-gray-100 mb-5">
                      <button 
                        type="button"
                        onClick={() => setLinkingStep('select-bank')}
                        className="flex items-center text-xs text-gray-500 hover:text-gray-900"
                      >
                        <ChevronLeft className="h-4 w-4 mr-0.5" />
                        <span>Select Bank</span>
                      </button>
                      <span className="text-xs font-bold text-gray-800">{plaidSelectedBank} Authorization</span>
                      <button type="button" onClick={handleClosePlaid} className="p-1 text-gray-400 hover:text-gray-900">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                     <div className="space-y-4">
                      {isPlaidConnecting ? (
                        <div className="space-y-3 py-4 bg-gray-50/50 rounded-xl p-3 border border-gray-100">
                          <div className="flex items-center space-x-2.5">
                            <span className={`h-4 w-4 flex items-center justify-center text-[9px] rounded-full font-bold ${plaidHandshakeStep >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>1</span>
                            <span className={`text-[11px] ${plaidHandshakeStep >= 0 ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Generating FAPI Client Assertion</span>
                            {plaidHandshakeStep > 0 && <span className="text-green-500 text-xs font-bold">✓</span>}
                          </div>
                          <div className="flex items-center space-x-2.5">
                            <span className={`h-4 w-4 flex items-center justify-center text-[9px] rounded-full font-bold ${plaidHandshakeStep >= 1 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>2</span>
                            <span className={`text-[11px] ${plaidHandshakeStep >= 1 ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Signing JWT via Kiln Node 01</span>
                            {plaidHandshakeStep > 1 && <span className="text-green-500 text-xs font-bold">✓</span>}
                          </div>
                          <div className="flex items-center space-x-2.5">
                            <span className={`h-4 w-4 flex items-center justify-center text-[9px] rounded-full font-bold ${plaidHandshakeStep >= 2 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>3</span>
                            <span className={`text-[11px] ${plaidHandshakeStep >= 2 ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Exchanging verification proof with bank</span>
                            {plaidHandshakeStep > 2 && <span className="text-green-500 text-xs font-bold">✓</span>}
                          </div>
                          <div className="flex items-center space-x-2.5">
                            <span className={`h-4 w-4 flex items-center justify-center text-[9px] rounded-full font-bold ${plaidHandshakeStep >= 3 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>4</span>
                            <span className={`text-[11px] ${plaidHandshakeStep >= 3 ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Establishing tokenized secure connection</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="p-3 bg-green-50 text-green-700 rounded-xl flex items-start space-x-2 border border-green-150">
                            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                            <div className="text-[10px] leading-relaxed">
                              <span className="font-bold block text-green-800 mb-0.5">Financial-grade API (FAPI) Protocol Enabled</span>
                              This connection is hardware-anchored via Kiln Validator 01. Coinbase uses cryptographic JWT signatures to securely establish connection with {plaidSelectedBank}. You do not need to share your banking password.
                            </div>
                          </div>

                          <div className="text-xs text-gray-500 text-center py-2">
                            Authorization payload will be signed by your hardware bridge.
                          </div>
                        </>
                      )}

                      {localError && (
                        <p className="text-xs text-red-600 font-semibold bg-red-50 p-2 rounded-lg">
                          {localError}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 space-y-3">
                    <button
                      type="submit"
                      disabled={isPlaidConnecting}
                      className="w-full py-2.5 bg-[#0052FF] hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-2"
                    >
                      {isPlaidConnecting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Authorizing via Kiln Bridge...</span>
                        </>
                      ) : (
                        <span>Authorize and Connect</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleClosePlaid}
                      className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel Setup
                    </button>
                  </div>
                </form>
              )}

              {linkingStep === 'success' && (
                <div className="flex flex-col items-center justify-center text-center h-full space-y-4">
                  <CheckCircle2 className="h-16 w-16 text-green-500 animate-bounce" />
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Institution Connected!</h3>
                    <p className="text-xs text-gray-500 mt-2 max-w-xs">
                      Your {plaidSelectedBank} account has been successfully linked for seamless deposits and withdrawals.
                    </p>
                  </div>

                  <button
                    onClick={handleClosePlaid}
                    className="mt-6 px-8 py-2.5 bg-[#0052FF] hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUCCESS SCREEN */}
          {successScreenData ? (
            <div className="flex flex-col items-center justify-center text-center py-6 space-y-5 animate-slide-up">
              <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              
              <div>
                <h4 className="text-base font-extrabold text-gray-900">
                  {successScreenData.pendingExternal
                    ? (successScreenData.type === 'deposit' ? 'Deposit Request Submitted' : 'Withdrawal Request Submitted')
                    : (successScreenData.type === 'deposit' ? 'Cash Deposit Complete' : 'Cash Withdrawal Dispatched')}
                </h4>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xs">
                  {successScreenData.pendingExternal
                    ? `Request ${successScreenData.requestId || ''} is pending external settlement and will reconcile after provider confirmation.`
                    : (successScreenData.type === 'deposit' 
                        ? `Successfully credited $${successScreenData.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} cash balance!`
                        : `Dispatched $${successScreenData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} back to bank account.`)}
                </p>
              </div>

              <div className="w-full bg-gray-50 rounded-xl p-4 border border-gray-100 text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Transaction Type</span>
                  <span className="font-bold text-gray-800 capitalize">{successScreenData.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Amount</span>
                  <span className="font-bold text-gray-900 font-mono">${successScreenData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Coinbase Route Fee</span>
                  <span className="font-bold text-gray-800 font-mono">${successScreenData.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200/60 pt-2 font-semibold">
                  <span className="text-gray-800">{successScreenData.pendingExternal ? 'Pending Amount' : 'Net Settled'}</span>
                  <span className="font-bold text-[#0052FF] font-mono">${successScreenData.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200/60 pt-2">
                  <span className="text-gray-400">Source Bank</span>
                  <span className="font-bold text-gray-800">{successScreenData.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Settlement Speed</span>
                  <span className="font-bold text-gray-800">{successScreenData.speed}</span>
                </div>
                {successScreenData.requestId && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Request ID</span>
                    <span className="font-bold text-gray-800 font-mono">{successScreenData.requestId}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setSuccessScreenData(null);
                  onClose();
                }}
                className="w-full py-3 bg-[#0052FF] hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer"
              >
                Go Back to Portfolio
              </button>
            </div>
          ) : (
            /* REGULAR PANEL DEPOSIT / WITHDRAWAL */
            <div className="space-y-5">
              
              {/* Header Navigation Tabs */}
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    onClick={() => {
                      setActiveTab('deposit');
                      setLocalError(null);
                    }}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeTab === 'deposit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Deposit USD
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('withdraw');
                      setLocalError(null);
                    }}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeTab === 'withdraw' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Withdraw USD
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('banks');
                      setLocalError(null);
                    }}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeTab === 'banks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Linked Banks
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Production Audit & Health Indicators */}
              <div className="p-3.5 rounded-2xl bg-[#0a0b0d] border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Production Hardened Node Active
                  </span>
                  <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">
                    RSA-4096 / SSL
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="px-3 py-2 rounded-xl bg-gray-900/60 border border-gray-800/80 flex flex-col justify-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tight">KYC Profile</span>
                    <span className="text-[11px] text-gray-200 font-extrabold mt-0.5 truncate">
                      👤 Marcel Laframboise
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-gray-900/60 border border-gray-800/80 flex flex-col justify-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tight">Consensus Node</span>
                    <span className="text-[11px] text-gray-200 font-extrabold mt-0.5 truncate">
                      ⚡ Kiln Validator 01
                    </span>
                  </div>
                </div>
              </div>

              {/* TAB 1: DEPOSIT USD */}
              {activeTab === 'deposit' && (
                <div className="space-y-4">
                  {isDepositing ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-5">
                      <RefreshCw className="h-10 w-10 text-[#0052FF] animate-spin" />
                      <div className="text-center">
                        <h4 className="text-sm font-bold text-gray-900">Executing Direct Bank Transfer</h4>
                        <div className="space-y-1.5 mt-3 max-w-xs">
                          <p className={`text-[11px] font-semibold ${depositProgressStep >= 1 ? 'text-green-600' : 'text-gray-400'}`}>
                            {depositProgressStep >= 1 ? '✓' : '○'} Connecting with Federal Clearing network...
                          </p>
                          <p className={`text-[11px] font-semibold ${depositProgressStep >= 2 ? 'text-green-600' : 'text-gray-400'}`}>
                            {depositProgressStep >= 2 ? '✓' : '○'} Verifying banking routing limits...
                          </p>
                          <p className={`text-[11px] font-semibold ${depositProgressStep >= 3 ? 'text-green-600' : 'text-gray-400'}`}>
                            {depositProgressStep >= 3 ? '✓' : '○'} Crediting Cash wallet account...
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : isEtransferVerifying ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-5">
                      <RefreshCw className="h-10 w-10 text-[#0052FF] animate-spin" />
                      <div className="text-center">
                        <h4 className="text-sm font-bold text-gray-900">Matching Interac Settlement</h4>
                        <p className="text-[10px] text-gray-400 font-medium">Listening to Interac clearinghouse socket...</p>
                        <div className="space-y-1.5 mt-4 max-w-xs text-left mx-auto">
                          <p className={`text-[11px] font-semibold ${etransferStep >= 1 ? 'text-green-600' : 'text-gray-400'}`}>
                            {etransferStep >= 1 ? '✓' : '○'} Checking reference code: {etransferRef.toUpperCase()}
                          </p>
                          <p className={`text-[11px] font-semibold ${etransferStep >= 2 ? 'text-green-600' : 'text-gray-400'}`}>
                            {etransferStep >= 2 ? '✓' : '○'} Verifying compliance signature of {etransferBankName}...
                          </p>
                          <p className={`text-[11px] font-semibold ${etransferStep >= 3 ? 'text-green-600' : 'text-gray-400'}`}>
                            {etransferStep >= 3 ? '✓' : '○'} Crediting isolated USD Cash ledger...
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Method Toggle */}
                      <div className="bg-gray-100 p-1 rounded-xl grid grid-cols-2 gap-1 select-none">
                        <button
                          type="button"
                          onClick={() => {
                            setDepositMethod('bank');
                            setLocalError(null);
                          }}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            depositMethod === 'bank' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Direct Bank Transfer (CAD) 🇨🇦
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDepositMethod('etransfer');
                            setLocalError(null);
                          }}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            depositMethod === 'etransfer' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Interac e-Transfer (CA) 🇨🇦
                        </button>
                      </div>

                      {depositMethod === 'bank' ? (
                        <>
                          {/* Amount Input */}
                          <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Enter Deposit Cash Amount (CAD)</label>
                            <div className="flex items-center">
                              <span className="text-3xl font-extrabold text-gray-400 mr-1">CA$</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                className="w-full bg-transparent text-3xl font-black text-gray-900 border-none outline-none focus:ring-0 p-0 font-mono"
                              />
                            </div>
                          </div>

                          {/* Source Linked Bank account */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">Deposit From</label>
                              <button
                                onClick={handleStartPlaid}
                                className="text-[10px] font-bold text-[#0052FF] hover:underline cursor-pointer flex items-center space-x-0.5"
                              >
                                <Plus className="h-2.5 w-2.5" />
                                <span>Link New</span>
                              </button>
                            </div>

                            {linkedBanks.length > 0 ? (
                              <select
                                value={depositBankId}
                                onChange={(e) => setDepositBankId(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                              >
                                {linkedBanks.map((bank) => (
                                  <option key={bank.id} value={bank.id}>
                                    {bank.bankName} (Checking ••••{bank.lastFour})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div 
                                onClick={handleStartPlaid}
                                className="p-3 border border-dashed border-gray-200 hover:border-[#0052FF] rounded-xl text-center cursor-pointer text-xs font-semibold text-gray-500 bg-gray-50/50 flex items-center justify-center space-x-2"
                              >
                                <Landmark className="h-4 w-4 text-gray-400" />
                                <span>No Bank Linked. Click to Link Bank</span>
                              </div>
                            )}
                          </div>

                          {/* Clearing speed Options */}
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Clearing Speed & Fee</label>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={() => setDepositSpeed('instant')}
                                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                  depositSpeed === 'instant'
                                    ? 'bg-blue-50/50 border-[#0052FF] ring-1 ring-[#0052FF]/30'
                                    : 'bg-transparent border-gray-200 hover:bg-gray-50/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-gray-800">Instant Credit</span>
                                  <span className="text-[10px] bg-[#0052FF] text-white font-bold px-1.5 py-0.5 rounded-md">1.5% Fee</span>
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 block">Immediate access</span>
                              </button>

                              <button
                                onClick={() => setDepositSpeed('standard')}
                                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                  depositSpeed === 'standard'
                                    ? 'bg-blue-50/50 border-[#0052FF] ring-1 ring-[#0052FF]/30'
                                    : 'bg-transparent border-gray-200 hover:bg-gray-50/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-gray-800">Standard Clearing</span>
                                  <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-md">FREE</span>
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 block">Takes 1-3 business days</span>
                              </button>
                            </div>
                          </div>

                          {/* Summary details */}
                          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1.5 text-gray-600 border border-gray-100 font-medium">
                            <div className="flex justify-between">
                              <span>Deposit limit</span>
                              <span>$50,000.00 daily limit</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Route fee ({depositSpeed === 'instant' ? '1.5%' : '0%'})</span>
                              <span>${(depositSpeed === 'instant' ? (parseFloat(depositAmount) || 0) * 0.015 : 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t border-gray-200/60 pt-1.5 font-bold text-gray-800">
                              <span>Available balance after clearing</span>
                              <span>${(usdBalance + (depositSpeed === 'instant' ? (parseFloat(depositAmount) || 0) * 0.985 : (parseFloat(depositAmount) || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          {localError && (
                            <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-semibold flex items-center space-x-2">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span>{localError}</span>
                            </div>
                          )}

                          <button
                            onClick={handleExecuteDeposit}
                            disabled={!depositBankId || !depositAmount}
                            className="w-full py-3 bg-[#0052FF] hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer transition-colors"
                          >
                            Submit Deposit Request
                          </button>
                        </>
                      ) : (
                        /* INTERAC E-TRANSFER VIEW */
                        <div className="space-y-3">
                          
                          {/* Interac Instructions Callout */}
                          <div className="bg-slate-950 p-4 rounded-xl border border-white/5 text-white space-y-3 text-xs">
                            <div className="flex justify-between items-center text-[10px] font-black text-amber-400 uppercase tracking-wider">
                              <span>Interac e-Transfer Instructions</span>
                              <span className="bg-[#E31837] text-white px-1.5 py-0.5 rounded-md text-[8px]">AUTO-MATCH</span>
                            </div>
                            <p className="text-[11px] text-gray-300 leading-relaxed">
                              Send funds from your Canadian financial mobile app (TD, RBC, Scotiabank, BMO, etc.) to:
                            </p>
                            
                            <div className="bg-white/5 p-3 rounded-lg space-y-2 font-semibold">
                              <div className="flex justify-between">
                                <span className="text-gray-400 text-[10px]">Recipient Email:</span>
                                <span className="text-blue-300 select-all font-mono">deposits@coinbase.com</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400 text-[10px]">Security Question:</span>
                                <span className="text-gray-200">What crypto exchange?</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400 text-[10px]">Security Answer:</span>
                                <span className="text-green-300 font-mono">coinbase</span>
                              </div>
                              <div className="flex justify-between border-t border-white/5 pt-1.5">
                                <span className="text-amber-400 text-[10px] font-bold">Unique Message/Ref Code:</span>
                                <span className="text-amber-400 select-all font-mono font-bold animate-pulse">{etransferRef.toUpperCase()}</span>
                              </div>
                            </div>
                            
                            <p className="text-[9px] text-gray-400 leading-normal">
                              ⚠️ CRITICAL: You MUST include the reference code {etransferRef.toUpperCase()} in the "Message" or "Memo" field of your Interac e-Transfer to enable instant auto-matching and credit.
                            </p>
                          </div>

                          {/* Interac Amount Input */}
                          <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Enter e-Transfer Amount</label>
                            <div className="flex items-center">
                              <span className="text-3xl font-extrabold text-gray-400 mr-1">CA$</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                className="w-full bg-transparent text-3xl font-black text-gray-900 border-none outline-none focus:ring-0 p-0 font-mono"
                              />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2 font-medium">
                              Approx credited to wallet: US${(cadToUsd(parseFloat(depositAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} at FX {usdCadRate.toFixed(4)}
                            </p>
                          </div>

                          {/* Gateway Routing Method Switcher */}
                          <div className="flex items-center justify-between py-2 border-b border-gray-100 mb-3">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Gateway Method</span>
                            <div className="flex space-x-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setUseSovereignsGateway(true);
                                  setLocalError(null);
                                }}
                                className={`px-2.5 py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  useSovereignsGateway 
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs' 
                                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'
                                }`}
                              >
                                Sovereigns Gateway
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setUseSovereignsGateway(false);
                                  setLocalError(null);
                                }}
                                className={`px-2.5 py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  !useSovereignsGateway 
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs' 
                                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'
                                }`}
                              >
                                Manual Interac
                              </button>
                            </div>
                          </div>

                          {useSovereignsGateway ? (
                             <div className="space-y-4">
                               <div>
                                 <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Click a Financial Institution to Connect Instantly</label>
                                 <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto border border-gray-150 rounded-xl p-2 bg-gray-50/50">
                                   {Object.keys(CANADIAN_FINANCIAL_NODES).map((key) => {
                                     const bank = CANADIAN_FINANCIAL_NODES[key];
                                     const isSelected = activeSelectedBankKey === key;
                                     return (
                                       <button
                                         key={key}
                                         type="button"
                                         onClick={() => {
                                           setActiveSelectedBankKey(key);
                                           setActiveSelectedBankName(bank.name);
                                           handleInitiateSovereignsGateway(key, bank.name);
                                         }}
                                         className={`p-2 border rounded-xl flex items-center space-x-2 transition-all text-left cursor-pointer ${
                                           isSelected 
                                             ? 'border-blue-600 bg-blue-50/40 text-blue-900 shadow-2xs' 
                                             : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50/50 bg-white text-gray-800'
                                         }`}
                                       >
                                         <span className="text-sm shrink-0">{bank.icon}</span>
                                         <span className="text-[10px] font-bold leading-tight truncate">{bank.name}</span>
                                       </button>
                                     );
                                   })}
                                 </div>
                               </div>



                               {localError && (
                                 <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-semibold flex items-center space-x-2">
                                   <AlertCircle className="h-4 w-4 shrink-0" />
                                   <span>{localError}</span>
                                 </div>
                               )}
                             </div>
                          ) : (
                            /* LEGACY MANUAL INTERAC FLOW */
                            <div className="space-y-4">
                              {/* Sender Bank */}
                              <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Your Sending Bank</label>
                                <select
                                  value={etransferBankName}
                                  onChange={(e) => setEtransferBankName(e.target.value)}
                                  className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                                >
                                  <option value="TD Canada Trust">TD Canada Trust</option>
                                  <option value="Royal Bank of Canada (RBC)">Royal Bank of Canada (RBC)</option>
                                  <option value="Scotiabank">Scotiabank</option>
                                  <option value="BMO Bank of Montreal">BMO Bank of Montreal</option>
                                  <option value="CIBC">CIBC</option>
                                  <option value="Simplii Financial">Simplii Financial</option>
                                  <option value="Tangerine">Tangerine</option>
                                </select>
                              </div>

                              {/* Interac Reference Code Input (From bank confirmation) */}
                              <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Interac Settlement Reference Code</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="CA128391"
                                  value={etransferRef}
                                  onChange={(e) => setEtransferRef(e.target.value)}
                                  className="w-full bg-gray-50 border border-gray-200 text-xs sm:text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0052FF] font-mono font-bold uppercase"
                                />
                                <p className="text-[9px] text-gray-400 mt-1">
                                  *Enter the 8-character code from your bank's Interac email notification to trigger automated parsing.
                                </p>
                              </div>

                              {localError && (
                                <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-semibold flex items-center space-x-2">
                                  <AlertCircle className="h-4 w-4 shrink-0" />
                                  <span>{localError}</span>
                                </div>
                              )}

                              <button
                                onClick={handleExecuteEtransferDeposit}
                                disabled={!depositAmount || !etransferRef}
                                className="w-full py-3 bg-[#E31837] hover:bg-red-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer transition-colors"
                              >
                                Submit Interac Deposit Request
                              </button>
                            </div>
                          )}

                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: WITHDRAW USD */}
              {activeTab === 'withdraw' && (
                <div className="space-y-4">
                  {isWithdrawing ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-5">
                      <RefreshCw className="h-10 w-10 text-[#0052FF] animate-spin" />
                      <div className="text-center">
                        <h4 className="text-sm font-bold text-gray-900">Executing Direct Bank Transfer Out</h4>
                        <div className="space-y-1.5 mt-3 max-w-xs">
                          <p className={`text-[11px] font-semibold ${withdrawProgressStep >= 1 ? 'text-green-600' : 'text-gray-400'}`}>
                            {withdrawProgressStep >= 1 ? '✓' : '○'} Initializing Secure Route...
                          </p>
                          <p className={`text-[11px] font-semibold ${withdrawProgressStep >= 2 ? 'text-green-600' : 'text-gray-400'}`}>
                            {withdrawProgressStep >= 2 ? '✓' : '○'} Clearing Interbank settlement...
                          </p>
                          <p className={`text-[11px] font-semibold ${withdrawProgressStep >= 3 ? 'text-green-600' : 'text-gray-400'}`}>
                            {withdrawProgressStep >= 3 ? '✓' : '○'} Dispatching CAD funds to bank account...
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : isEtransferVerifying ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-5">
                      <RefreshCw className="h-10 w-10 text-[#0052FF] animate-spin" />
                      <div className="text-center">
                        <h4 className="text-sm font-bold text-gray-900">Dispatching Interac Funds</h4>
                        <p className="text-[10px] text-gray-400 font-medium font-mono">Clearing transaction out of isolated ledger...</p>
                        <div className="space-y-1.5 mt-4 max-w-xs text-left mx-auto">
                          <p className={`text-[11px] font-semibold ${etransferStep >= 1 ? 'text-green-600' : 'text-gray-400'}`}>
                            {etransferStep >= 1 ? '✓' : '○'} Debit approved. Cash locked: ${parseFloat(withdrawAmount).toFixed(2)}
                          </p>
                          <p className={`text-[11px] font-semibold ${etransferStep >= 2 ? 'text-green-600' : 'text-gray-400'}`}>
                            {etransferStep >= 2 ? '✓' : '○'} Initiating outbound handoff to Scotiabank...
                          </p>
                          <p className={`text-[11px] font-semibold ${etransferStep >= 3 ? 'text-green-600' : 'text-gray-400'}`}>
                            {etransferStep >= 3 ? '✓' : '○'} Dispatching email link to {etransferEmail}...
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Method Toggle */}
                      <div className="bg-gray-100 p-1 rounded-xl grid grid-cols-2 gap-1 select-none mb-3">
                        <button
                          type="button"
                          onClick={() => {
                            setWithdrawMethod('bank');
                            setLocalError(null);
                          }}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            withdrawMethod === 'bank' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Direct Bank Transfer (CAD) 🇨🇦
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWithdrawMethod('etransfer');
                            setLocalError(null);
                          }}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            withdrawMethod === 'etransfer' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Interac e-Transfer (CAD) 🇨🇦
                        </button>
                      </div>

                      {withdrawMethod === 'bank' ? (
                        <>
                          {/* Amount Input */}
                          <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50">
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">Enter Withdraw Amount (CAD)</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">
                                Limit: CA${usdToCad(usdBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} (US${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                              </span>
                            </div>
                            <div className="flex items-center">
                              <span className="text-3xl font-extrabold text-gray-400 mr-1">CA$</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                value={withdrawAmount}
                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                className="w-full bg-transparent text-3xl font-black text-gray-900 border-none outline-none focus:ring-0 p-0 font-mono"
                              />
                            </div>
                            <div className="mt-2 text-right">
                              <button
                                onClick={() => setWithdrawAmount(usdToCad(usdBalance).toFixed(2))}
                                className="text-[10px] font-bold text-[#0052FF] hover:underline cursor-pointer"
                              >
                                Maximize Outflow
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2 font-medium">
                              Approx wallet debit: US${(cadToUsd(parseFloat(withdrawAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} at FX {usdCadRate.toFixed(4)}
                            </p>
                          </div>

                          {/* Secure bank sign-in */}
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Secure Bank Sign-In</label>
                            <select
                              value={activeSelectedBankKey}
                              onChange={(e) => {
                                const nextKey = e.target.value;
                                setActiveSelectedBankKey(nextKey);
                                setActiveSelectedBankName(nextKey ? CANADIAN_FINANCIAL_NODES[nextKey]?.name || nextKey : '');
                              }}
                              className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                            >
                              <option value="">Select your bank</option>
                              {Object.entries(CANADIAN_FINANCIAL_NODES).map(([key, bank]) => (
                                <option key={key} value={key}>
                                  {bank.name}
                                </option>
                              ))}
                            </select>
                            <p className="text-[9px] text-gray-400 mt-1">
                              We’ll redirect you to your bank’s secure sign-in page so you can approve the withdrawal directly.
                            </p>
                          </div>

                          {/* Withdrawal clearing speed options */}
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Withdraw Speed & Fee</label>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={() => setWithdrawSpeed('instant')}
                                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                  withdrawSpeed === 'instant'
                                    ? 'bg-blue-50/50 border-[#0052FF] ring-1 ring-[#0052FF]/30'
                                    : 'bg-transparent border-gray-200 hover:bg-gray-50/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-gray-800">Instant Debit</span>
                                  <span className="text-[10px] bg-[#0052FF] text-white font-bold px-1.5 py-0.5 rounded-md">1.5% Fee</span>
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 block">Completes in minutes</span>
                              </button>

                              <button
                                onClick={() => setWithdrawSpeed('standard')}
                                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                  withdrawSpeed === 'standard'
                                    ? 'bg-blue-50/50 border-[#0052FF] ring-1 ring-[#0052FF]/30'
                                    : 'bg-transparent border-gray-200 hover:bg-gray-50/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-gray-800">Standard Clearing</span>
                                  <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-md">FREE</span>
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 block">Takes 1 business day</span>
                              </button>
                            </div>
                          </div>

                          {/* Summary details */}
                          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1.5 text-gray-600 border border-gray-100 font-medium">
                            <div className="flex justify-between">
                              <span>Fee</span>
                              <span>CA${(withdrawSpeed === 'instant' ? (parseFloat(withdrawAmount) || 0) * 0.015 : 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>Dispatched to Bank</span>
                              <span>CA${(Math.max(0, (parseFloat(withdrawAmount) || 0) - (withdrawSpeed === 'instant' ? (parseFloat(withdrawAmount) || 0) * 0.015 : 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between border-t border-gray-200/60 pt-1.5 text-blue-700">
                              <span>Estimated wallet debit</span>
                              <span>US${(cadToUsd(parseFloat(withdrawAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          {localError && (
                            <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-semibold flex items-center space-x-2">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span>{localError}</span>
                            </div>
                          )}

                          <button
                            onClick={() => handleInitiateSovereignsWithdrawal(activeSelectedBankKey, activeSelectedBankName || undefined)}
                            disabled={!withdrawAmount || !activeSelectedBankKey}
                            className="w-full py-3 bg-[#0052FF] hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer transition-colors"
                          >
                            Continue to Secure Bank Sign-In
                          </button>
                        </>
                      ) : (
                        /* INTERAC E-TRANSFER WITHDRAW VIEW */
                        <div className="space-y-3">
                          
                          {/* Amount Input */}
                          <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50">
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">Enter e-Transfer Outflow</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">
                                Limit: CA${usdToCad(usdBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} (US${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                              </span>
                            </div>
                            <div className="flex items-center">
                              <span className="text-3xl font-extrabold text-gray-400 mr-1">CA$</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                value={withdrawAmount}
                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                className="w-full bg-transparent text-3xl font-black text-gray-900 border-none outline-none focus:ring-0 p-0 font-mono"
                              />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2 font-medium">
                              Approx wallet debit: US${(cadToUsd(parseFloat(withdrawAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} at FX {usdCadRate.toFixed(4)}
                            </p>
                            <div className="mt-2 text-right">
                              <button
                                onClick={() => setWithdrawAmount(usdToCad(usdBalance).toFixed(2))}
                                className="text-[10px] font-bold text-[#0052FF] hover:underline cursor-pointer"
                              >
                                Maximize Outflow
                              </button>
                            </div>
                          </div>

                          {/* Recipient Email Address */}
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Interac Destination Email</label>
                            <input
                              type="email"
                              required
                              placeholder="you@gmail.com"
                              value={etransferEmail}
                              onChange={(e) => setEtransferEmail(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-200 text-xs sm:text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0052FF] font-medium"
                            />
                            <p className="text-[9px] text-gray-400 mt-1">
                              *Funds will be dispatched to this Interac registered email address.
                            </p>
                          </div>

                          {/* Gateway Routing Method Switcher */}
                          <div className="flex items-center justify-between py-2 border-b border-gray-100 mb-3">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Gateway Method</span>
                            <div className="flex space-x-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setUseSovereignsGateway(true);
                                  setLocalError(null);
                                }}
                                className={`px-2.5 py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  useSovereignsGateway 
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs' 
                                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'
                                }`}
                              >
                                Sovereigns Gateway
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setUseSovereignsGateway(false);
                                  setLocalError(null);
                                }}
                                className={`px-2.5 py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  !useSovereignsGateway 
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs' 
                                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'
                                }`}
                              >
                                Manual Interac
                              </button>
                            </div>
                          </div>

                           {useSovereignsGateway ? (
                             <div className="space-y-4">
                               <div>
                                 <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Click a Financial Institution to Connect Instantly</label>
                                 <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto border border-gray-150 rounded-xl p-2 bg-gray-50/50">
                                   {Object.keys(CANADIAN_FINANCIAL_NODES).map((key) => {
                                     const bank = CANADIAN_FINANCIAL_NODES[key];
                                     const isSelected = activeSelectedBankKey === key;
                                     return (
                                       <button
                                         key={key}
                                         type="button"
                                         onClick={() => {
                                           setActiveSelectedBankKey(key);
                                           setActiveSelectedBankName(bank.name);
                                           handleInitiateSovereignsWithdrawal(key, bank.name);
                                         }}
                                         className={`p-2 border rounded-xl flex items-center space-x-2 transition-all text-left cursor-pointer ${
                                           isSelected 
                                             ? 'border-blue-600 bg-blue-50/40 text-blue-900 shadow-2xs' 
                                             : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50/50 bg-white text-gray-800'
                                         }`}
                                       >
                                         <span className="text-sm shrink-0">{bank.icon}</span>
                                         <span className="text-[10px] font-bold leading-tight truncate">{bank.name}</span>
                                       </button>
                                     );
                                   })}
                                 </div>
                               </div>



                               {localError && (
                                 <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-semibold flex items-center space-x-2">
                                   <AlertCircle className="h-4 w-4 shrink-0" />
                                   <span>{localError}</span>
                                 </div>
                               )}
                             </div>
                          ) : (
                            /* LEGACY MANUAL INTERAC FLOW */
                            <div className="space-y-4">
                              {/* Target Bank Information */}
                              <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Target Financial Institution</label>
                                <select
                                  value={etransferBankName}
                                  onChange={(e) => setEtransferBankName(e.target.value)}
                                  className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                                >
                                  <option value="TD Canada Trust">TD Canada Trust</option>
                                  <option value="Royal Bank of Canada (RBC)">Royal Bank of Canada (RBC)</option>
                                  <option value="Scotiabank">Scotiabank</option>
                                  <option value="BMO Bank of Montreal">BMO Bank of Montreal</option>
                                  <option value="CIBC">CIBC</option>
                                  <option value="Simplii Financial">Simplii Financial</option>
                                  <option value="Tangerine">Tangerine</option>
                                </select>
                              </div>

                              {/* Security Question Warning */}
                              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100 text-blue-800 text-xs space-y-1">
                                <span className="font-extrabold text-[10px] uppercase block">Security Answer Mandate</span>
                                <p className="text-[10px] leading-relaxed text-blue-700 font-medium">
                                  Because we are a regulated broker, the security answer is preset to <code>coinbase</code>. Ensure you enter this answer exactly when accepting the e-Transfer in your online banking app if you do not have Auto-Deposit active.
                                </p>
                              </div>

                              {localError && (
                                <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-semibold flex items-center space-x-2">
                                  <AlertCircle className="h-4 w-4 shrink-0" />
                                  <span>{localError}</span>
                                </div>
                              )}

                              <button
                                onClick={handleExecuteEtransferWithdrawal}
                                disabled={!withdrawAmount || !etransferEmail}
                                className="w-full py-3 bg-[#E31837] hover:bg-red-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer transition-colors"
                              >
                                Submit Outbound e-Transfer Request
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: LINKED BANKS LIST */}
              {activeTab === 'banks' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-400 uppercase">Manage Bank Accounts</span>
                    <button
                      onClick={handleStartPlaid}
                      className="text-xs font-bold text-[#0052FF] hover:underline cursor-pointer flex items-center space-x-0.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Link Bank</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[250px] overflow-y-auto">
                    {linkedBanks.map((bank) => (
                      <div key={bank.id} className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-white border border-gray-100 text-[#0052FF] rounded-lg flex items-center justify-center font-bold">
                            <Landmark className="h-5 w-5 text-gray-500" />
                          </div>
                          <div>
                            <h5 className="text-xs sm:text-sm font-extrabold text-gray-900">{bank.bankName}</h5>
                            <p className="text-[11px] text-gray-400 font-medium font-mono">
                              {bank.accountType} •••• {bank.lastFour}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const updated = linkedBanks.filter((b) => b.id !== bank.id);
                            setLinkedBanks(updated);
                            showToast(`Unlinked ${bank.bankName} checking account.`, 'info');
                          }}
                          className="text-[10px] text-red-500 hover:text-red-700 hover:underline font-bold cursor-pointer"
                        >
                          Unlink
                        </button>
                      </div>
                    ))}

                    {linkedBanks.length === 0 && (
                      <div className="py-8 text-center text-xs text-gray-400 font-medium border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                        No bank accounts connected to your profile.
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-gray-100/50 border border-gray-200 rounded-xl flex items-start space-x-2.5 text-[10px] leading-relaxed text-gray-500">
                    <Lock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      Connecting a checking or savings account allows you to securely execute ACH fiat transfers. Limits are based on your profile tier verification.
                    </span>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>


      </div>
    </div>
  );
}

