import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Download,
  CheckCircle2,
  ShieldCheck,
  FolderGit2,
  QrCode,
  Sparkles,
  Terminal,
  ExternalLink,
  Layers,
  HardDrive
} from 'lucide-react';

interface AppDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const AppDownloadModal: React.FC<AppDownloadModalProps> = ({
  isOpen,
  onClose,
  showToast
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'pwa' | 'android'>('pwa');

  useEffect(() => {
    // Listen for browser PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app is already running in standalone PWA mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  if (!isOpen) return null;

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        showToast('Sovereign Wealth PWA installed successfully!', 'success');
        setIsPwaInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      showToast(
        'To install as PWA: Click your browser menu (⋮ or Share) and tap "Add to Home Screen" or "Install App".',
        'info'
      );
    }
  };

  const handleDownloadApk = () => {
    const link = document.createElement('a');
    link.href = '/sovereign-app.apk';
    link.download = 'sovereign-wealth-portal.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Android APK download initiated!', 'success');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-gray-100 space-y-6 relative animate-in zoom-in-95 duration-150 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-50 text-[#0052FF] rounded-2xl border border-blue-100">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black text-gray-900">Download & Native Apps</h2>
                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200">
                  PWA & GRADLE
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Install as a standalone Web App (PWA) or build the native Android Gradle project.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-gray-100 p-1 rounded-2xl space-x-1">
          <button
            onClick={() => setActiveTab('pwa')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'pwa'
                ? 'bg-white text-[#0052FF] shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            <span>Progressive Web App (PWA)</span>
          </button>
          <button
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'android'
                ? 'bg-white text-[#0052FF] shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Android Gradle App</span>
          </button>
        </div>

        {/* TAB 1: Progressive Web App (PWA) */}
        {activeTab === 'pwa' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                    One-Click Mobile & Desktop PWA
                  </span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                  Service Worker Active
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                Install Sovereign Wealth as an app directly on iOS, Android, macOS, or Windows without downloading from an app store. Features offline caching and full screen standalone display.
              </p>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Offline Ledger Access</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Full Screen No-Bar UI</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Instant App Launcher</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Automatic Sync</span>
                </div>
              </div>
            </div>

            {/* Install Action */}
            <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-black text-gray-900">Ready to Install</h4>
                <p className="text-[11px] text-gray-500">
                  {isPwaInstalled
                    ? 'App is running in standalone PWA mode.'
                    : 'Tap below to trigger native PWA prompt.'}
                </p>
              </div>

              <button
                onClick={handleInstallPwa}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#0052FF] hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer flex items-center justify-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>{deferredPrompt ? 'Install PWA Now' : 'Add to Home Screen'}</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Android App with Gradle */}
        {activeTab === 'android' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* APK Download Highlight Card */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-2xl space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider flex items-center">
                  <ShieldCheck className="h-4 w-4 mr-1 text-emerald-400" />
                  Android Package (APK) & Gradle Source
                </span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-mono border border-indigo-400/30">
                  SDK 34 (Android 14)
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                The repository includes a complete Android Studio Gradle project located at <code className="bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded font-mono text-[10px]">/android</code> with full permissions for Internet, NFC Tap-to-Pay, and Biometrics.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={handleDownloadApk}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  <span>Download sovereign-app.apk</span>
                </button>
              </div>
            </div>

            {/* Gradle Build Terminal Box */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800 pb-2">
                <span className="flex items-center text-slate-300">
                  <Terminal className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                  Gradle Build Instructions
                </span>
                <span className="text-gray-500">Android Studio / CLI</span>
              </div>

              <div className="space-y-1.5 font-mono text-[11px] text-emerald-400 pt-1 select-all">
                <p className="text-slate-400"># 1. Sync Capacitor web assets into Android project</p>
                <p className="bg-slate-900 p-2 rounded border border-slate-800 text-white">
                  npx cap copy android
                </p>

                <p className="text-slate-400 pt-1"># 2. Build Release APK via Gradle Wrapper</p>
                <p className="bg-slate-900 p-2 rounded border border-slate-800 text-white">
                  cd android && ./gradlew assembleRelease
                </p>
              </div>
            </div>

            {/* Android Manifest Info */}
            <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs text-gray-700 space-y-1">
              <span className="font-extrabold text-gray-900 block text-[11px] uppercase tracking-wider">
                Configured Permissions & Features:
              </span>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-600 pt-1">
                <span>• Package: <strong className="text-gray-800">com.sovereign.wealth</strong></span>
                <span>• Scheme: <strong className="text-gray-800">sovereign://app</strong></span>
                <span>• Biometric Auth & NFC Tap</span>
                <span>• Hardware Acceleration</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Close */}
        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppDownloadModal;
