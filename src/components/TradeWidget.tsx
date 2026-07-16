import React, { useState, useEffect } from 'react';
import { ArrowUpDown, HelpCircle, CheckCircle2, Wallet, RefreshCw, AlertCircle } from 'lucide-react';
import { Coin, Holding } from '../types';

function isReactEventTargetValue(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): string {
  return e.target.value;
}

interface TradeWidgetProps {
  coins: Coin[];
  holdings: Holding[];
  usdBalance: number;
  onExecuteTrade: (
    type: 'BUY' | 'SELL' | 'CONVERT',
    params: {
      symbol: string;
      amount: number;
      fiatAmount: number;
      targetSymbol?: string;
    }
  ) => void;
  selectedAssetSymbol?: string;
}

export default function TradeWidget({
  coins,
  holdings,
  usdBalance,
  onExecuteTrade,
  selectedAssetSymbol = 'BTC'
}: TradeWidgetProps) {
  if (!coins || coins.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center justify-center text-center py-12 min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-gray-500 font-semibold">Loading live market rates...</p>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'convert'>('buy');
  
  // Coin select states
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState(selectedAssetSymbol);
  const [convertFromSymbol, setConvertFromSymbol] = useState('BTC');
  const [convertToSymbol, setConvertToSymbol] = useState('ETH');
  
  // Input amounts
  const [amountFiat, setAmountFiat] = useState('100');
  const [amountCrypto, setAmountCrypto] = useState('');
  const [isFiatInput, setIsFiatInput] = useState(true);

  // Convert Tab amounts
  const [convertAmount, setConvertAmount] = useState('0.1');

  // Payment Methods
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'bank' | 'card'

  // Form Submitting and Success screens
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCoin = coins.find((c) => c.symbol === selectedCoinSymbol) || coins[0];
  const fromCoin = coins.find((c) => c.symbol === convertFromSymbol) || coins[0];
  const toCoin = coins.find((c) => c.symbol === convertToSymbol) || coins[1];

  const currentHolding = holdings.find((h) => h.symbol === selectedCoinSymbol) || { symbol: selectedCoinSymbol, amount: 0 };
  const fromHolding = holdings.find((h) => h.symbol === convertFromSymbol) || { symbol: convertFromSymbol, amount: 0 };

  // Sync state if selected asset symbol changes externally (e.g. from selecting asset in table)
  useEffect(() => {
    setSelectedCoinSymbol(selectedAssetSymbol);
  }, [selectedAssetSymbol]);

  // Recalculate Fiat/Crypto inputs depending on which input is active
  useEffect(() => {
    if (activeTab === 'convert') return;

    if (isFiatInput) {
      const fiat = parseFloat(amountFiat);
      if (isNaN(fiat) || fiat <= 0) {
        setAmountCrypto('');
      } else {
        setAmountCrypto((fiat / selectedCoin.price).toFixed(6));
      }
    } else {
      const crypto = parseFloat(amountCrypto);
      if (isNaN(crypto) || crypto <= 0) {
        setAmountFiat('');
      } else {
        setAmountFiat((crypto * selectedCoin.price).toFixed(2));
      }
    }
  }, [amountFiat, amountCrypto, selectedCoin, isFiatInput, activeTab]);

  // Fee computations
  const fiatVal = parseFloat(amountFiat) || 0;
  const coinbaseFee = fiatVal === 0 ? 0 : fiatVal < 10 ? 0.99 : fiatVal < 50 ? 1.99 : fiatVal < 200 ? 2.99 : parseFloat((fiatVal * 0.0149).toFixed(2));
  const subtotal = fiatVal;
  const totalCost = activeTab === 'buy' ? subtotal + coinbaseFee : subtotal - coinbaseFee;

  const handleAction = () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (activeTab === 'buy') {
      const fiat = parseFloat(amountFiat);
      if (isNaN(fiat) || fiat <= 0) {
        setErrorMessage('Please enter a valid amount.');
        return;
      }
      
      if (paymentMethod === 'cash' && totalCost > usdBalance) {
        setErrorMessage(`Insufficient USD Cash Balance. You need $${totalCost.toFixed(2)} but only have $${usdBalance.toFixed(2)}.`);
        return;
      }

      setLoading(true);
      setTimeout(() => {
        onExecuteTrade('BUY', {
          symbol: selectedCoin.symbol,
          amount: parseFloat(amountCrypto),
          fiatAmount: fiatVal
        });
        setLoading(false);
        setSuccessMessage(`Successfully purchased ${parseFloat(amountCrypto).toFixed(6)} ${selectedCoin.symbol} for $${totalCost.toFixed(2)}.`);
        setAmountFiat('100');
      }, 1000);
    } 
    
    else if (activeTab === 'sell') {
      const cryptoAmount = parseFloat(amountCrypto);
      if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
        setErrorMessage('Please enter a valid amount to sell.');
        return;
      }

      if (cryptoAmount > currentHolding.amount) {
        setErrorMessage(`Insufficient ${selectedCoin.symbol} balance. You own ${currentHolding.amount.toFixed(6)} but tried to sell ${cryptoAmount.toFixed(6)}.`);
        return;
      }

      setLoading(true);
      setTimeout(() => {
        onExecuteTrade('SELL', {
          symbol: selectedCoin.symbol,
          amount: cryptoAmount,
          fiatAmount: fiatVal
        });
        setLoading(false);
        setSuccessMessage(`Successfully sold ${cryptoAmount.toFixed(6)} ${selectedCoin.symbol} for $${totalCost.toFixed(2)}.`);
        setAmountCrypto('');
        setAmountFiat('');
      }, 1000);
    } 
    
    else if (activeTab === 'convert') {
      const fromAmount = parseFloat(convertAmount);
      if (isNaN(fromAmount) || fromAmount <= 0) {
        setErrorMessage('Please enter a valid conversion amount.');
        return;
      }

      if (fromAmount > fromHolding.amount) {
        setErrorMessage(`Insufficient ${fromCoin.symbol} balance. You hold ${fromHolding.amount.toFixed(6)} but tried to convert ${fromAmount.toFixed(6)}.`);
        return;
      }

      if (fromCoin.symbol === toCoin.symbol) {
        setErrorMessage('Cannot convert an asset to itself.');
        return;
      }

      setLoading(true);
      setTimeout(() => {
        const valueInUSD = fromAmount * fromCoin.price;
        const targetCryptoAmount = valueInUSD / toCoin.price;

        onExecuteTrade('CONVERT', {
          symbol: fromCoin.symbol,
          amount: fromAmount,
          fiatAmount: valueInUSD,
          targetSymbol: toCoin.symbol
        });
        setLoading(false);
        setSuccessMessage(`Successfully converted ${fromAmount} ${fromCoin.symbol} to ${targetCryptoAmount.toFixed(6)} ${toCoin.symbol}.`);
        setConvertAmount('');
      }, 1000);
    }
  };

  const handleUseMax = () => {
    setIsFiatInput(false);
    if (activeTab === 'sell') {
      setAmountCrypto(currentHolding.amount.toString());
    } else if (activeTab === 'convert') {
      setConvertAmount(fromHolding.amount.toString());
    }
  };

  // Convert exchange rates
  const conversionRate = fromCoin && toCoin ? (fromCoin.price / toCoin.price).toFixed(6) : '0';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full min-h-[420px]" id="trade-widget">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-gray-50/50">
        {(['buy', 'sell', 'convert'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-4 text-center text-sm font-semibold capitalize border-b-2 cursor-pointer transition-all ${
              activeTab === tab
                ? 'border-[#0052FF] text-[#0052FF] bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50/80'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Widget Body */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        {successMessage ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-8 animate-fade-in">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Trade Executed</h3>
              <p className="text-sm text-gray-600 mt-2 max-w-xs mx-auto">
                {successMessage}
              </p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="px-6 py-2 bg-[#0052FF] text-white text-sm font-semibold rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            {/* Input and Coins Selectors */}
            <div>
              {/* Asset Selector */}
              {activeTab !== 'convert' ? (
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Asset
                  </span>
                  <select
                    value={selectedCoinSymbol}
                    onChange={(e) => setSelectedCoinSymbol(isReactEventTargetValue(e))}
                    className="bg-gray-50 border border-gray-200 text-gray-800 text-sm font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0052FF] cursor-pointer"
                  >
                    {coins.map((coin) => (
                      <option key={coin.symbol} value={coin.symbol}>
                        {coin.name} ({coin.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-4 items-center">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">From</span>
                    <select
                      value={convertFromSymbol}
                      onChange={(e) => setConvertFromSymbol(isReactEventTargetValue(e))}
                      className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs font-semibold px-2 py-1.5 rounded-lg focus:outline-none cursor-pointer"
                    >
                      {coins.map((coin) => (
                        <option key={coin.symbol} value={coin.symbol}>
                          {coin.symbol}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">To</span>
                    <select
                      value={convertToSymbol}
                      onChange={(e) => setConvertToSymbol(isReactEventTargetValue(e))}
                      className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs font-semibold px-2 py-1.5 rounded-lg focus:outline-none cursor-pointer"
                    >
                      {coins.map((coin) => (
                        <option key={coin.symbol} value={coin.symbol}>
                          {coin.symbol}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Trade Balance Helpers */}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span className="flex items-center"><Wallet className="w-3.5 h-3.5 mr-1" />
                  {activeTab === 'buy'
                    ? `Cash: $${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : activeTab === 'sell'
                    ? `Available: ${currentHolding.amount.toFixed(6)} ${selectedCoin.symbol}`
                    : `Available: ${fromHolding.amount.toFixed(6)} ${fromCoin.symbol}`}
                </span>
                {activeTab !== 'buy' && (
                  <button
                    onClick={handleUseMax}
                    className="text-[#0052FF] font-semibold hover:underline cursor-pointer"
                  >
                    Use Max
                  </button>
                )}
              </div>

              {/* Amount Inputs */}
              {activeTab !== 'convert' ? (
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/30 hover:border-gray-300 transition-colors relative">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      {isFiatInput ? (
                        <div className="flex items-center">
                          <span className="text-2xl font-bold text-gray-400 mr-0.5">$</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={amountFiat}
                            onChange={(e) => {
                              setIsFiatInput(true);
                              setAmountFiat(isReactEventTargetValue(e));
                            }}
                            className="w-full bg-transparent text-3xl font-extrabold text-gray-900 border-none outline-none focus:ring-0 p-0 font-mono"
                          />
                        </div>
                      ) : (
                        <input
                          type="number"
                          placeholder="0.00"
                          value={amountCrypto}
                          onChange={(e) => {
                            setIsFiatInput(false);
                            setAmountCrypto(isReactEventTargetValue(e));
                          }}
                          className="w-full bg-transparent text-3xl font-extrabold text-gray-900 border-none outline-none focus:ring-0 p-0 font-mono"
                        />
                      )}
                      <div className="text-xs text-gray-400 mt-1.5 font-medium">
                        {isFiatInput
                          ? `≈ ${amountCrypto || '0.00'} ${selectedCoin.symbol}`
                          : `≈ $${parseFloat(amountFiat || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                      </div>
                    </div>

                    <button
                      onClick={() => setIsFiatInput(!isFiatInput)}
                      className="p-2.5 bg-white border border-gray-100 hover:border-gray-200 hover:shadow-xs rounded-full transition-all text-gray-500 hover:text-gray-900 cursor-pointer"
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/30">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Convert Amount ({fromCoin.symbol})</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(isReactEventTargetValue(e))}
                    className="w-full bg-transparent text-2xl font-extrabold text-gray-900 border-none outline-none focus:ring-0 p-0 font-mono"
                  />
                  <div className="flex justify-between items-center text-xs text-gray-400 mt-2 font-mono">
                    <span>Rate: 1 {fromCoin.symbol} ≈ {conversionRate} {toCoin.symbol}</span>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  </div>
                </div>
              )}

              {/* Payment Select / Sell Payout Selector */}
              {activeTab === 'buy' && (
                <div className="mt-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Payment Method</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(isReactEventTargetValue(e))}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                  >
                    <option value="cash">USD Cash Balance (${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })})</option>
                    <option value="bank">Chase Bank Checking (*4920)</option>
                    <option value="card">Visa Platinum Credit Card (*8294)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Error Indicators */}
            {errorMessage && (
              <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs flex items-start space-x-2 border border-red-100 animate-pulse">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Price Calculations Review & Final Button */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              {activeTab !== 'convert' && (
                <div className="space-y-1.5 text-xs text-gray-500 font-medium">
                  <div className="flex justify-between">
                    <span>Purchase price</span>
                    <span className="font-mono">${selectedCoin.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Coinbase Fee</span>
                    <span className="font-mono">${coinbaseFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-900 font-bold">
                    <span>{activeTab === 'buy' ? 'Total Cost' : 'Payout Total'}</span>
                    <span className="font-mono">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleAction}
                disabled={loading}
                className="w-full bg-[#0052FF] hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3.5 px-4 rounded-xl shadow-xs transition-colors cursor-pointer text-center text-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Transacting Securely...</span>
                ) : activeTab === 'buy' ? (
                  `Buy ${selectedCoin.symbol}`
                ) : activeTab === 'sell' ? (
                  `Sell ${selectedCoin.symbol}`
                ) : (
                  `Convert ${fromCoin.symbol} to ${toCoin.symbol}`
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
