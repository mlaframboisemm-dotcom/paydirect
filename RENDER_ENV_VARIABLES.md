# Render Production Environment Variables Reference

To successfully deploy and pass the production readiness check on Render, you must configure the following Environment Variables in the Render Dashboard (under **Dashboard -> Your Service -> Environment**).

---

## 🔐 Required Core Security Configurations

### 1. `NODE_ENV`
* **Description:** Tells the application to run in strict, secure, production-hardened mode.
* **Value:** `production`

### 2. `PORT`
* **Description:** The network port the server binds to.
* **Value:** `3000`

### 3. `SOVEREIGN_ENCRYPTION_KEY`
* **Description:** The master ledger encryption key. Must be a minimum of 32 characters long.
* **Active Value in your Workspace:**
  ```text
  sovereign-local-dev-encryption-key-32-chars-long-0001
  ```
* *Note: You can use this active key or generate a unique 32+ character random string for production.*

### 4. `JWT_SECRET`
* **Description:** Secret key used to sign and verify user authentication session tokens. Must be a minimum of 32 characters long.
* **Active Value in your Workspace:**
  ```text
  sovereign-local-dev-jwt-secret-32-chars-long-0001
  ```
* *Note: You can use this active key or generate a unique 32+ character random string for production.*

---

## 💼 Sovereign Hot Wallet Configuration

### 5. `MARSHALL_WALLET_PRIVATE_KEY`
* **Description:** The active private key (minimum 32 characters/hexadecimal format) for the Marshall sovereign hot wallet to verify and trigger outbound settlements.
* **Requirement:** Must be a valid, strong private key (e.g., your Ethereum/EVM-compatible wallet private key in hex format).

---

## 📈 Live Exchange Integration

### 6. `COINBASE_API_KEY_ID`
* **Description:** Coinbase Cloud Developer Portal API Key ID (used for institutional liquidity matching and database synchronization).
* **Format:** Must be at least 8 characters. (e.g., `organizations/xxxx-xxxx/apiKeys/xxxx-xxxx`)

### 7. `COINBASE_API_SECRET_RAW`
* **Description:** The raw Coinbase Cloud API private key secret.
* **Format:** Must be at least 8 characters (typically structured as a private key PEM or raw string).

*(Note: The system also supports `KRAKEN_API_KEY` and `KRAKEN_API_SECRET` as alternatives; however, the production environment verification script strictly validates `COINBASE_API_KEY_ID` and `COINBASE_API_SECRET_RAW` as primary production endpoints. Ensure both Coinbase values are populated.)*

---

## 📧 Administrative & Warning Notifications

### 8. `SOVEREIGN_ADMIN_EMAILS`
* **Description:** Comma-separated list of administrative email addresses authorized to execute critical operations and receive security/compliance notifications.
* **Format:** E.g., `admin@yourdomain.com` or `mlaframboisemm@gmail.com,compliance@yourdomain.com`

---

## 🔗 Sync and Connection (Optional/Render Config Specific)

### 9. `SOV_PIN`
* **Description:** Your 6-digit Sovereign security PIN used for terminal syncing.
* **Format:** E.g., `000000`

### 10. `SOV_TERMINAL_URL`
* **Description:** Sovereign terminal callback URL to sync events.
* **Value:** `https://ais-dev-vsguby4cvne7edjk3z4bzv-522633331757.us-east1.run.app`

---

## 📋 Copy-Paste `.env.production` Template

If you want to save these locally or load them in a `.env.production` file, copy this block:

```env
NODE_ENV=production
PORT=3000
SOVEREIGN_ENCRYPTION_KEY=sovereign-local-dev-encryption-key-32-chars-long-0001
JWT_SECRET=sovereign-local-dev-jwt-secret-32-chars-long-0001
MARSHALL_WALLET_PRIVATE_KEY=your_real_marshall_wallet_private_key_here_at_least_32_chars
COINBASE_API_KEY_ID=your_real_coinbase_api_key_id_here
COINBASE_API_SECRET_RAW=your_real_coinbase_api_secret_raw_here
SOVEREIGN_ADMIN_EMAILS=mlaframboisemm@gmail.com
SOV_PIN=000000
SOV_TERMINAL_URL=https://ais-dev-vsguby4cvne7edjk3z4bzv-522633331757.us-east1.run.app
```
