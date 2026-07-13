# Deploying to Render — Environment & Secret setup

This file explains which environment variables and secret files the app expects, and step-by-step instructions for configuring them in Render.

Important security note
- Never commit real secrets to the repository. Use the Render dashboard (Environment or Secret Files) or a cloud secret manager.

1) Required production secrets
- `SOVEREIGN_ENCRYPTION_KEY` — AES/HMAC key used for ledger encryption; must be at least 32 characters.
- `JWT_SECRET` — session signing secret; must be at least 32 characters.
- `SOVEREIGN_ADMIN_EMAILS` — comma-separated admin email addresses.
- `MARSHALL_WALLET_PRIVATE_KEY` — optional but required for on-chain operations in production.
- `COINBASE_API_KEY_ID` and `COINBASE_API_SECRET_RAW` OR `KRAKEN_API_KEY` and `KRAKEN_API_SECRET` — exchange API credentials.
- Email delivery: `MAILERSEND_API_KEY` OR `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`.

2) Optional but recommended
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the GCP credentials JSON file inside the container (e.g. `/etc/secrets/gcp.json`) if you use Secret Manager.
- `SOVEREIGN_SECRET_MANAGER_PROJECT_ID` — GCP project id to load secrets from Secret Manager.

3) Using Render Environment Variables (recommended)

- Open your Render service > Environment (or the new Render UI section for Environment Variables).
- Click Edit and add each key and value from `env.render.full.example` or `env.render.example`.
- For `SOVEREIGN_ENCRYPTION_KEY` and `JWT_SECRET` paste long random secrets (32+ chars).
- For email/exchange/wallet keys, paste exact secret tokens from your provider.

4) Using Render Secret Files (for file-based secrets)

- In Render, under your service, find "Secret Files" and click Edit.
- Add a file name (for example `gcp.json` or `.env`) and paste the file contents.
- If you add `gcp.json`, set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to `/etc/secrets/gcp.json`.

5) Common pitfalls and troubleshooting
- If `Callback URI` or other URL env variables are `undefined` in logs, confirm `FAPI_CALLBACK_URI` (or `APP_URL`) is set in Environment Variables.
- If production readiness fails (error lists missing configuration), Render didn't provide required keys — re-check all required keys above.
- Ensure the `GOOGLE_APPLICATION_CREDENTIALS` path matches the secret file name and that the app's `resolveSecretManagerProjectId()` finds the project.

6) Minimal step-by-step (quick copy)

1. Go to your Render service page.
2. Open Environment → Edit.
3. Add variables (example):

   - `SOVEREIGN_ENCRYPTION_KEY` = (paste 32+ char secret)
   - `JWT_SECRET` = (paste 32+ char secret)
   - `SOVEREIGN_ADMIN_EMAILS` = admin@example.com
   - `MARSHALL_WALLET_PRIVATE_KEY` = (paste private key)
   - `COINBASE_API_KEY_ID` = (paste key id)
   - `COINBASE_API_SECRET_RAW` = (paste secret)
   - `MAILERSEND_API_KEY` = (paste api key) OR `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`

4. (Optional) Under Secret Files, add `gcp.json` if you use GCP Secret Manager and set `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/gcp.json`.
5. Redeploy the service.

7) Example: adding a Secret File named `.env`

- Add a Secret File with filename `.env` and paste the contents of `env.render.full.example` (with real values).
- The file will be available during build and runtime; the app uses `dotenv.config()`.

If you'd like, I can also prepare a single `.render-setup.txt` with the exact key/value pairs (placeholders masked) in the format you can copy-paste into Render's UI. Tell me whether you prefer a single copy-paste list or individual steps for each key.
