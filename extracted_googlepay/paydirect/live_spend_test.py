import requests, json, time

BASE = 'http://localhost:3000'
RESULTS = {}

def log(label, status, data):
    icon = "✅" if status in [200, 201] else "❌"
    RESULTS[label] = {'status': status, 'ok': status in [200,201], 'data': data}
    print(f"{icon} [{status}] {label}: {json.dumps(data)[:200]}")

# ── STEP 1: Login and get session cookie ──────────────────────────────────────
print("\n=== STEP 1: AUTHENTICATE ===")
login_r = requests.post(f'{BASE}/api/auth/login',
    json={'email': 'mlaframboisemm@gmail.com', 'password': 'Sovereign2026!'})
login_d = login_r.json()
token = login_d.get('token', '')
log('login', login_r.status_code, {'user': login_d.get('user',{}).get('name',''), 'kyc': login_d.get('user',{}).get('kycLevel',''), 'token_len': len(token)})

# Use cookie header directly (server requires cb_session cookie)
COOKIE = f'cb_session={token}'
H = {'Cookie': COOKIE, 'Content-Type': 'application/json'}

# ── STEP 2: Load balances ─────────────────────────────────────────────────────
print("\n=== STEP 2: LOAD SOVEREIGN BALANCES ===")
bal_r = requests.get(f'{BASE}/api/coinbase/balances', headers=H)
bal_d = bal_r.json()
holdings = bal_d.get('holdings', [])
usd = bal_d.get('usdBalance', 0)
log('balances', bal_r.status_code, {'mode': bal_d.get('mode'), 'usd': usd, 'assets': len(holdings)})
for h in sorted(holdings, key=lambda x: x.get('amount',0)*0.001, reverse=True)[:5]:
    print(f"   {h['symbol']}: {h['amount']:,.4f}")

# ── STEP 3: Get live prices ───────────────────────────────────────────────────
print("\n=== STEP 3: LIVE MARKET PRICES ===")
price_r = requests.get(f'{BASE}/api/prices', headers=H)
price_d = price_r.json()
coins = price_d.get('coins', [])
log('prices', price_r.status_code, {'coins': len(coins)})
price_map = {c['symbol']: c['price'] for c in coins}
for sym in ['BTC','ETH','SOL','USDC','LINK']:
    p = price_map.get(sym, 0)
    if p: print(f"   {sym}: ${p:,.2f}")

# ── STEP 4: BUY test — Buy 0.001 BTC with USDC ───────────────────────────────
print("\n=== STEP 4: LIVE BUY TEST (0.001 BTC) ===")
btc_price = price_map.get('BTC', 65000)
buy_r = requests.post(f'{BASE}/api/coinbase/trade', headers=H,
    json={'side': 'BUY', 'symbol': 'BTC', 'amount': 0.001,
          'fiatAmount': round(0.001 * btc_price, 2), 'assetSymbol': 'BTC'})
log('buy_btc', buy_r.status_code, buy_r.json() if buy_r.ok else buy_r.text[:200])

# ── STEP 5: SELL test — Sell 100 LINK ────────────────────────────────────────
print("\n=== STEP 5: LIVE SELL TEST (100 LINK) ===")
link_price = price_map.get('LINK', 8.5)
sell_r = requests.post(f'{BASE}/api/coinbase/trade', headers=H,
    json={'side': 'SELL', 'symbol': 'LINK', 'amount': 100,
          'fiatAmount': round(100 * link_price, 2), 'assetSymbol': 'LINK'})
log('sell_link', sell_r.status_code, sell_r.json() if sell_r.ok else sell_r.text[:200])

# ── STEP 6: CONVERT test — Convert USDC to ETH ───────────────────────────────
print("\n=== STEP 6: LIVE CONVERT TEST (1000 USDC → ETH) ===")
eth_price = price_map.get('ETH', 1900)
convert_r = requests.post(f'{BASE}/api/exchanges/trade', headers=H,
    json={'side': 'BUY', 'assetSymbol': 'ETH', 'amount': round(1000/eth_price, 6),
          'fiatAmount': 1000, 'symbol': 'ETH', 'action': 'buy'})
log('convert_usdc_eth', convert_r.status_code, convert_r.json() if convert_r.ok else convert_r.text[:200])

# ── STEP 7: ON-CHAIN SEND test ────────────────────────────────────────────────
print("\n=== STEP 7: ON-CHAIN SEND TEST (0.001 ETH) ===")
send_r = requests.post(f'{BASE}/api/wallet/send', headers=H,
    json={'assetSymbol': 'ETH', 'amount': 0.001,
          'recipientAddress': '0x740aF45d81835B368E9Df03e8D37B8ee89bA2Da4',
          'side': 'send', 'symbol': 'ETH', 'toAddress': '0x740aF45d81835B368E9Df03e8D37B8ee89bA2Da4'})
log('send_eth_onchain', send_r.status_code, send_r.json() if send_r.ok else send_r.text[:300])

# ── STEP 8: STRIPE BALANCE ───────────────────────────────────────────────────
print("\n=== STEP 8: STRIPE LIVE BALANCE ===")
stripe_r = requests.get(f'{BASE}/api/stripe/balance', headers=H)
log('stripe_balance', stripe_r.status_code, stripe_r.json() if stripe_r.ok else stripe_r.text[:200])

# ── STEP 9: WITHDRAWAL to bank ───────────────────────────────────────────────
print("\n=== STEP 9: WITHDRAWAL TEST ($10 CAD → Tangerine) ===")
wd_r = requests.post(f'{BASE}/api/withdrawal/initiate', headers=H,
    json={'amount': 10.0, 'currency': 'CAD', 'bankKey': 'tangerine',
          'accountType': 'chequing', 'recipientName': 'Marcel Laframboise'})
log('withdrawal_tangerine', wd_r.status_code, wd_r.json() if wd_r.ok else wd_r.text[:300])

# ── STEP 10: SPENDABILITY CHECK ──────────────────────────────────────────────
print("\n=== STEP 10: SPENDABILITY AUDIT ===")
spend_r = requests.get(f'{BASE}/api/transactions/spendability', headers=H)
log('spendability', spend_r.status_code, spend_r.json() if spend_r.ok else spend_r.text[:300])

# ── STEP 11: EXCHANGE SYNC ───────────────────────────────────────────────────
print("\n=== STEP 11: EXCHANGE SYNC (Coinbase + Kraken) ===")
sync_r = requests.post(f'{BASE}/api/exchanges/sync', headers=H, json={})
log('exchange_sync', sync_r.status_code, sync_r.json() if sync_r.ok else sync_r.text[:300])

# ── STEP 12: MARSHALL GATEWAY ────────────────────────────────────────────────
print("\n=== STEP 12: MARSHALL GATEWAY STATUS ===")
mg_r = requests.get(f'{BASE}/api/marshall/config', headers=H)
log('marshall_gateway', mg_r.status_code, mg_r.json() if mg_r.ok else mg_r.text[:200])

# ── SUMMARY ──────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("LIVE SPENDING TEST SUMMARY")
print("="*60)
passed = sum(1 for v in RESULTS.values() if v['ok'])
failed = len(RESULTS) - passed
print(f"✅ PASSED: {passed}/{len(RESULTS)}")
print(f"❌ FAILED: {failed}/{len(RESULTS)}")
print()
for k, v in RESULTS.items():
    icon = "✅" if v['ok'] else "❌"
    print(f"  {icon} {k}: HTTP {v['status']}")
