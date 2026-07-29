import requests, json, time

BASE = 'http://localhost:3000'
R = {}

def log(label, status, data):
    icon = "✅" if status in [200,201] else "❌"
    R[label] = {'status': status, 'ok': status in [200,201], 'data': data}
    print(f"{icon} [{status}] {label}: {json.dumps(data, default=str)[:250]}")

# ── AUTH ──────────────────────────────────────────────────────────────────────
print("\n=== AUTHENTICATION ===")
login = requests.post(f'{BASE}/api/auth/login',
    json={'email': 'mlaframboisemm@gmail.com', 'password': 'Sovereign2026!'})
d = login.json()
token = d.get('token', '')
log('login', login.status_code, {'user': d.get('user',{}).get('name',''), 'kyc': d.get('user',{}).get('kycLevel',''), 'ok': bool(token)})

if not token:
    print("FATAL: Cannot login. Stopping.")
    exit(1)

H = {'Cookie': f'cb_session={token}', 'Content-Type': 'application/json'}

# ── SOVEREIGN BALANCES ────────────────────────────────────────────────────────
print("\n=== SOVEREIGN BALANCES ===")
r = requests.get(f'{BASE}/api/sovereign/balances', headers=H)
d = r.json()
log('sovereign_balances', r.status_code, {'usd': d.get('usdBalance',0), 'assets': d.get('totalAssets',0)})
if r.ok:
    for h in sorted(d.get('holdings',[]), key=lambda x: x.get('amount',0), reverse=True)[:6]:
        print(f"   {h['symbol']}: {h['amount']:,.4f}")

# ── BUY TEST ─────────────────────────────────────────────────────────────────
print("\n=== BUY 0.01 BTC (Sovereign Ledger) ===")
r = requests.post(f'{BASE}/api/sovereign/trade', headers=H,
    json={'side': 'BUY', 'symbol': 'BTC', 'amount': 0.01, 'fiatAmount': 660.0})
log('buy_btc', r.status_code, r.json() if r.ok else r.text[:200])

# ── SELL TEST ─────────────────────────────────────────────────────────────────
print("\n=== SELL 500 LINK (Sovereign Ledger) ===")
r = requests.post(f'{BASE}/api/sovereign/trade', headers=H,
    json={'side': 'SELL', 'symbol': 'LINK', 'amount': 500, 'fiatAmount': 4316.5})
log('sell_link', r.status_code, r.json() if r.ok else r.text[:200])

# ── SELL ETH TEST ─────────────────────────────────────────────────────────────
print("\n=== SELL 1 ETH (Sovereign Ledger) ===")
r = requests.post(f'{BASE}/api/sovereign/trade', headers=H,
    json={'side': 'SELL', 'symbol': 'ETH', 'amount': 1, 'fiatAmount': 1918.77})
log('sell_eth', r.status_code, r.json() if r.ok else r.text[:200])

# ── CONVERT TEST ──────────────────────────────────────────────────────────────
print("\n=== CONVERT 10000 USDC → ETH ===")
r = requests.post(f'{BASE}/api/sovereign/convert', headers=H,
    json={'fromSymbol': 'USDC', 'toSymbol': 'ETH', 'fromAmount': 10000})
log('convert_usdc_eth', r.status_code, r.json() if r.ok else r.text[:200])

# ── SEND TEST ─────────────────────────────────────────────────────────────────
print("\n=== SEND 0.001 ETH (On-Chain / Ledger) ===")
r = requests.post(f'{BASE}/api/sovereign/send', headers=H,
    json={'symbol': 'ETH', 'amount': 0.001, 'toAddress': '0x740aF45d81835B368E9Df03e8D37B8ee89bA2Da4', 'memo': 'Test sovereign send'})
log('send_eth', r.status_code, r.json() if r.ok else r.text[:200])

# ── WITHDRAW TEST ─────────────────────────────────────────────────────────────
print("\n=== WITHDRAW $50 CAD to Tangerine ===")
r = requests.post(f'{BASE}/api/sovereign/withdraw', headers=H,
    json={'amount': 50, 'currency': 'CAD', 'bankKey': 'tangerine', 'recipientName': 'Marcel Laframboise'})
log('withdraw_cad', r.status_code, r.json() if r.ok else r.text[:200])

# ── SELL PEPE TEST ────────────────────────────────────────────────────────────
print("\n=== SELL 1,000,000 PEPE ===")
r = requests.post(f'{BASE}/api/sovereign/trade', headers=H,
    json={'side': 'SELL', 'symbol': 'PEPE', 'amount': 1000000, 'fiatAmount': 2850.0})
log('sell_pepe', r.status_code, r.json() if r.ok else r.text[:200])

# ── SELL SOL TEST ─────────────────────────────────────────────────────────────
print("\n=== SELL 10 SOL ===")
r = requests.post(f'{BASE}/api/sovereign/trade', headers=H,
    json={'side': 'SELL', 'symbol': 'SOL', 'amount': 10, 'fiatAmount': 772.9})
log('sell_sol', r.status_code, r.json() if r.ok else r.text[:200])

# ── SELL USDC TEST ────────────────────────────────────────────────────────────
print("\n=== SELL 5000 USDC ===")
r = requests.post(f'{BASE}/api/sovereign/trade', headers=H,
    json={'side': 'SELL', 'symbol': 'USDC', 'amount': 5000, 'fiatAmount': 5005.0})
log('sell_usdc', r.status_code, r.json() if r.ok else r.text[:200])

# ── STRIPE BALANCE ────────────────────────────────────────────────────────────
print("\n=== STRIPE LIVE BALANCE ===")
r = requests.get(f'{BASE}/api/stripe/balance', headers=H)
log('stripe_balance', r.status_code, r.json() if r.ok else r.text[:200])

# ── COINBASE BALANCES ─────────────────────────────────────────────────────────
print("\n=== COINBASE/SOVEREIGN BALANCES (via main endpoint) ===")
r = requests.get(f'{BASE}/api/coinbase/balances', headers=H)
d = r.json()
log('coinbase_balances', r.status_code, {'mode': d.get('mode'), 'usd': d.get('usdBalance',0), 'assets': len(d.get('holdings',[]))})

# ── TRANSACTION HISTORY ───────────────────────────────────────────────────────
print("\n=== TRANSACTION HISTORY ===")
r = requests.get(f'{BASE}/api/sovereign/transactions', headers=H)
d = r.json()
log('tx_history', r.status_code, {'count': d.get('count',0)})
if r.ok:
    for tx in d.get('transactions',[])[:5]:
        print(f"   {tx.get('type','?')} {tx.get('amount','?')} {tx.get('asset_symbol','?')} — {tx.get('status','?')}")

# ── UPDATED BALANCES ──────────────────────────────────────────────────────────
print("\n=== UPDATED BALANCES AFTER SPENDING ===")
r = requests.get(f'{BASE}/api/sovereign/balances', headers=H)
d = r.json()
log('updated_balances', r.status_code, {'usd': d.get('usdBalance',0), 'assets': d.get('totalAssets',0)})
if r.ok:
    for h in sorted(d.get('holdings',[]), key=lambda x: x.get('amount',0), reverse=True)[:8]:
        print(f"   {h['symbol']}: {h['amount']:,.4f}")

# ── SUMMARY ───────────────────────────────────────────────────────────────────
print("\n" + "="*65)
print("LIVE SOVEREIGN SPENDING TEST RESULTS")
print("="*65)
passed = sum(1 for v in R.values() if v['ok'])
failed = len(R) - passed
print(f"✅ PASSED: {passed}/{len(R)}")
print(f"❌ FAILED: {failed}/{len(R)}")
print()
for k, v in R.items():
    icon = "✅" if v['ok'] else "❌"
    print(f"  {icon} {k}: HTTP {v['status']}")
