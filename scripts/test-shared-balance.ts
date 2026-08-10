import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSharedBalance } from '../src/lib/shared-balance';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
if (!appSource.includes('<WiseCardDashboard') || !appSource.includes('usdBalance={liveCashBalance}') || !appSource.includes('cadBalance={liveCashBalanceCad}')) {
  throw new Error('WiseCardDashboard must receive shared USD/CAD balance props from the app shell.');
}

const wiseCardSource = fs.readFileSync(path.resolve(__dirname, '../src/components/WiseCardDashboard.tsx'), 'utf8');
if (!wiseCardSource.includes("from '../lib/shared-balance'") || !wiseCardSource.includes('resolveSharedBalance(')) {
  throw new Error('WiseCardDashboard should use the shared balance resolver.');
}

const preferred = resolveSharedBalance({
  preferredUsdBalance: 1250.5,
  preferredCadBalance: 1700.25,
  fallbackUsdBalance: 900,
  fallbackCadBalance: 1200
});

if (preferred.usdBalance !== 1250.5 || preferred.cadBalance !== 1700.25) {
  throw new Error(`Preferred balances should win: ${JSON.stringify(preferred)}`);
}

const fallback = resolveSharedBalance({
  preferredUsdBalance: undefined,
  preferredCadBalance: undefined,
  fallbackUsdBalance: 500,
  fallbackCadBalance: 700
});

if (fallback.usdBalance !== 500 || fallback.cadBalance !== 700) {
  throw new Error(`Fallback balances should be used: ${JSON.stringify(fallback)}`);
}

const derived = resolveSharedBalance({
  preferredUsdBalance: undefined,
  preferredCadBalance: undefined,
  fallbackUsdBalance: 100,
  fallbackCadBalance: undefined
});

if (derived.cadBalance !== 136.02) {
  throw new Error(`CAD should derive from USD when missing: ${JSON.stringify(derived)}`);
}

console.log('shared-balance tests passed');
