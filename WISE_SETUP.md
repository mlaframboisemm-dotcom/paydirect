## Wise Integration Setup

This project can fetch live Wise balances and execute payouts using the Wise API.

1. Copy `.env.example` to `.env.local` (or set env vars in your deployment environment).

```bash
cp .env.example .env.local
# Edit .env.local and set WISE_API_TOKEN to your Wise token
```

2. Required env vars (minimum):
- `WISE_API_TOKEN` — your Wise personal API token or platform access token. Keep this secret.
- `WISE_SANDBOX_MODE` — `true` for sandbox, `false` for live.
- `WISE_BUSINESS_PROFILE_ID` — numeric profile id for business profile (optional; defaults provided in `.env.example`).

3. Start the server and ensure `NODE_ENV` is set appropriately:

```bash
# development
npm run dev

# production
npm run build
npm start
```

4. Open the app and visit the Developer Hub. Click "Fetch Live" under "Wise Live Balances" to pull balances from Wise.

Notes:
- Do not paste tokens into public channels. Use environment variables or secret managers.
- For production use, rotate keys and restrict scopes.
