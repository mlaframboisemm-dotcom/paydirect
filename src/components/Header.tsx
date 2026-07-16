import React, { useState, useEffect } from 'react';
import { Search, Bell, Menu, Compass, ArrowUpRight, ArrowDownLeft, X, Wallet, ShieldCheck, User, LogOut, Award, CreditCard, ChevronDown } from 'lucide-react';
import { Coin } from '../types';

interface HeaderProps {
  coins: Coin[];
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onSearchSelect: (coin: Coin) => void;
  onOpenSendReceive: (action: 'send' | 'receive') => void;
  portfolioValue: number;
  userName: string;
  userEmail: string;
  citizenship: string;
  kycLevel: number;
  onLogout: () => void;
  realCoinbaseMode?: boolean;
  backendStatus?: 'online' | 'degraded' | 'offline';
}

export default function Header({
  coins,
  currentTab,
  setCurrentTab,
  onSearchSelect,
  onOpenSendReceive,
  portfolioValue,
  userName,
  userEmail,
  citizenship,
  kycLevel,
  onLogout,
  realCoinbaseMode,
  backendStatus = 'online'
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Monitor scroll for clean border shadow effect like Coinbase
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredCoins = searchQuery
    ? coins.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.symbol.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const navItems = [
    { id: 'dashboard', label: 'Assets' },
    { id: 'trade', label: 'Trade' },
    { id: 'onboarding', label: 'KYC & Limits' },
    { id: 'learn', label: 'Learning Rewards', badge: 'Earn $12' },
    { id: 'card', label: 'Coinbase Card' },
    { id: 'stripe', label: 'Stripe Hub' },
    { id: 'address', label: 'Address Hub' },
    { id: 'api', label: 'Developer Hub' },
    { id: 'history', label: 'Transactions' }
  ];

  const notifications = [
    {
      id: 'n1',
      title: 'Solana Learning Reward Available',
      desc: 'Complete the speed & scaling quiz to earn $3 of SOL instantly.',
      time: 'Just now',
      unread: true,
      tab: 'learn'
    },
    {
      id: 'n2',
      title: 'Bitcoin Market Update',
      desc: 'Bitcoin has crossed the $64,000 threshold, up 3.42% in 24 hours.',
      time: '2 hours ago',
      unread: false,
      tab: 'trade'
    },
    {
      id: 'n3',
      title: 'Deposit Successful',
      desc: 'Your cash transfer of $10,000.00 has completed successfully.',
      time: '1 day ago',
      unread: false,
      tab: 'dashboard'
    }
  ];

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 bg-white ${
        scrolled ? 'border-b border-gray-200/80 shadow-xs' : 'border-b border-gray-100'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left Side: Brand Logo */}
        <div className="flex items-center space-x-8">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className="flex items-center space-x-2 cursor-pointer focus:outline-none"
            id="coinbase-logo-btn"
          >
            {/* High fidelity Coinbase logo */}
            <svg
              className="w-8 h-8 text-[#0052FF]"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span className="text-xl font-bold text-[#0052FF] tracking-tight font-sans select-none">
              coinbase
            </span>
          </button>

          {realCoinbaseMode && (
            <span className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-200 animate-pulse select-none shrink-0">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span>LIVE CDP LEDGER</span>
            </span>
          )}

          <span className={`flex items-center space-x-1 px-2.5 py-1 text-[10px] font-black rounded-full border select-none shrink-0 ${backendStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : backendStatus === 'degraded' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${backendStatus === 'online' ? 'bg-emerald-500' : backendStatus === 'degraded' ? 'bg-amber-500' : 'bg-rose-500'}`} />
            <span>{backendStatus === 'online' ? 'SYSTEM ONLINE' : backendStatus === 'degraded' ? 'SYSTEM DEGRADED' : 'SYSTEM OFFLINE'}</span>
          </span>

          {/* Nav Links for Desktop */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`px-4 py-2 text-sm font-medium rounded-full cursor-pointer transition-colors relative ${
                  currentTab === item.id
                    ? 'text-[#0052FF] bg-[#0052FF]/5'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                id={`nav-${item.id}`}
              >
                {item.label}
                {item.badge && (
                  <span className="absolute -top-1.5 -right-3 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full border border-green-200">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Middle: Search bar */}
        <div className="hidden md:flex flex-1 max-w-sm mx-8 relative">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search crypto assets..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              className="w-full bg-gray-50 hover:bg-gray-100/70 focus:bg-white text-gray-800 text-sm pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-[#0052FF] focus:outline-none focus:ring-2 focus:ring-[#0052FF]/15 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            )}
          </div>

          {/* Search Dropdown Panel */}
          {showSearchResults && searchQuery && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSearchResults(false)}
              />
              <div className="absolute top-12 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-80 overflow-y-auto py-2">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Assets Found
                </div>
                {filteredCoins.length > 0 ? (
                  filteredCoins.map((coin) => (
                    <button
                      key={coin.id}
                      onClick={() => {
                        onSearchSelect(coin);
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                      className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer text-left"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold font-mono"
                          style={{ backgroundColor: coin.color }}
                        >
                          {coin.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {coin.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {coin.symbol}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900">
                          ${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            coin.change24h >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {coin.change24h >= 0 ? '+' : ''}
                          {coin.change24h.toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-6 text-sm text-center text-gray-500">
                    No matching assets found.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Side: Quick CTAs, Notification & Profile */}
        <div className="flex items-center space-x-3">
          {/* Send & Receive */}
          <div className="hidden sm:flex items-center space-x-2">
            <button
              onClick={() => onOpenSendReceive('send')}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200/80 rounded-lg flex items-center space-x-1 transition-all cursor-pointer"
              id="header-send-btn"
            >
              <ArrowUpRight className="h-4 w-4 text-gray-600" />
              <span>Send</span>
            </button>
            <button
              onClick={() => onOpenSendReceive('receive')}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200/80 rounded-lg flex items-center space-x-1 transition-all cursor-pointer"
              id="header-receive-btn"
            >
              <ArrowDownLeft className="h-4 w-4 text-gray-600" />
              <span>Receive</span>
            </button>
          </div>

          {/* Quick Pay / Balance Display */}
          <div className="hidden md:flex flex-col items-end px-3 py-1 bg-gray-50 rounded-lg border border-gray-100 select-none">
            <span className="text-[10px] text-gray-400 font-medium">PORTFOLIO</span>
            <span className="text-sm font-bold text-gray-900">
              ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-full transition-colors cursor-pointer"
              id="notification-bell-btn"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
            </button>

            {showNotifications && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowNotifications(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-2">
                  <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                    <span className="font-semibold text-gray-900 text-sm">
                      Notifications
                    </span>
                    <button className="text-[11px] text-[#0052FF] font-semibold hover:underline">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setCurrentTab(n.tab);
                          setShowNotifications(false);
                        }}
                        className="w-full px-4 py-3 border-b border-gray-50 hover:bg-gray-50 text-left transition-colors flex items-start space-x-2.5 cursor-pointer"
                      >
                        <div className="mt-0.5">
                          {n.unread ? (
                            <span className="w-2 h-2 bg-blue-600 rounded-full inline-block" />
                          ) : (
                            <span className="w-2 h-2 bg-transparent rounded-full inline-block" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-900">
                            {n.title}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                            {n.desc}
                          </p>
                          <span className="text-[10px] text-gray-400 mt-1 block font-mono">
                            {n.time}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              className="flex items-center space-x-1.5 p-1 rounded-full hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none"
              id="profile-menu-btn"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm select-none uppercase">
                {userName ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'JD'}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-gray-500 hidden sm:block" />
            </button>

            {showProfileMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowProfileMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-2">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {userName || 'Jane Doe'}
                    </p>
                    <p className="text-xs text-gray-500 font-mono truncate">
                      {userEmail || 'account@secure.local'}
                    </p>
                    
                    {/* Citizenship & KYC badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded flex items-center space-x-1">
                        <span>{citizenship === 'Canada' ? '🇨🇦 CAD' : '🇺🇸 USD'}</span>
                        <span className="text-[9px] text-blue-500 font-mono font-medium">({citizenship})</span>
                      </span>
                      <span className="text-[10px] bg-green-50 text-green-700 font-bold px-2 py-0.5 rounded flex items-center space-x-1">
                        <ShieldCheck className="h-2.5 w-2.5 text-green-600" />
                        <span>Tier {kycLevel || 1}</span>
                      </span>
                    </div>
                  </div>
                  
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setCurrentTab('profile');
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 cursor-pointer text-left font-medium"
                    >
                      <User className="h-4 w-4 text-[#0052FF]" />
                      <span className="font-bold text-gray-900">My Profile Hub</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('onboarding');
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 cursor-pointer text-left font-medium"
                    >
                      <ShieldCheck className="h-4 w-4 text-gray-400" />
                      <span>KYC Verification & Limits</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('card');
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 cursor-pointer text-left font-medium"
                    >
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      <span>Coinbase Card</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('learn');
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 cursor-pointer text-left font-medium"
                    >
                      <Award className="h-4 w-4 text-gray-400" />
                      <span>Learning Rewards</span>
                    </button>
                  </div>
                  
                  <div className="border-t border-gray-100 pt-1 mt-1">
                    <button
                      onClick={() => {
                        onLogout();
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-xs sm:text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 cursor-pointer text-left font-semibold"
                    >
                      <LogOut className="h-4 w-4 text-red-500" />
                      <span>Sign Out Securely</span>
                    </button>
                  </div>
                  
                  <div className="border-t border-gray-100 pt-1.5 mt-1">
                    <div className="px-4 py-1 flex items-center justify-between text-[9px] text-gray-400 font-mono">
                      <span>SECURE ISOLATION</span>
                      <ShieldCheck className="h-3 w-3 text-green-500 animate-pulse" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Mobile Nav Panel */}
      <div className="lg:hidden flex items-center justify-around border-t border-gray-100 py-2.5 px-2 bg-gray-50/70">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentTab(item.id)}
            className={`text-xs px-2.5 py-1.5 font-medium rounded-full cursor-pointer transition-colors relative ${
              currentTab === item.id
                ? 'text-[#0052FF] bg-[#0052FF]/10'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {item.label === 'Learning Rewards' ? 'Earn' : item.label}
            {item.badge && (
              <span className="absolute -top-1 right-0 w-2 h-2 bg-green-500 rounded-full border border-white" />
            )}
          </button>
        ))}
      </div>
    </header>
  );
}
