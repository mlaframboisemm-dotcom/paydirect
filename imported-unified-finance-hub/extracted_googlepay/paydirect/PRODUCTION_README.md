# Production Deployment & Maintenance Guide

This document outlines the step-by-step instructions to configure, run, and maintain the Sovereign Wealth Portal in a live production environment.

## 1. Process Management (Running in the Background)

To ensure the server runs continuously in the background and restarts automatically upon server reboot or unexpected crashes, use **PM2**.

### For Linux Servers (Ubuntu/Debian/CentOS)
1. Install PM2 globally:
   ```bash
   sudo npm install -g pm2
   ```
2. Build the application:
   ```bash
   npm run build
   ```
3. Start the server under PM2:
   ```bash
   pm2 start dist/server.cjs --name "sovereign-portal"
   ```
4. Save the PM2 list and configure auto-start on boot:
   ```bash
   pm2 startup
   pm2 save
   ```

### For Windows Servers
1. Install PM2 globally via PowerShell:
   ```powershell
   npm install -g pm2
   npm install -g pm2-windows-service
   ```
2. Build the application:
   ```powershell
   npm run build
   ```
3. Start the server under PM2:
   ```powershell
   pm2 start dist/server.cjs --name "sovereign-portal"
   pm2 save
   ```

---

## 2. Automated Ledger Backups (Security Compliance)

A backup script is pre-provisioned at `scripts/backup-ledger.ts`. You can run it via `npm run ledger:backup`. 

### Scheduling Daily Backups on Linux (Cron)
Add the backup job to your crontab so that it backs up the database daily at 2:00 AM:
1. Open the crontab editor:
   ```bash
   crontab -e
   ```
2. Paste the following line (replace `/var/www/coinbase3` with your actual server directory):
   ```cron
   0 2 * * * cd /var/www/coinbase3 && npm run ledger:backup >> /var/log/ledger-backups.log 2>&1
   ```

### Scheduling Daily Backups on Windows (Task Scheduler)
1. Create a basic task in **Windows Task Scheduler**.
2. Set the trigger to **Daily** at your preferred time.
3. Set the action to **Start a program**:
   * Program/script: `npm`
   * Arguments: `run ledger:backup`
   * Start in: `C:\Users\WINNNEER\Downloads\coinbase3` (or your active deployment directory).

---

## 3. Reverse Proxy Configuration (Nginx & SSL)

We recommend routing all public traffic through Nginx. This handles SSL termination safely and handles security handshakes.

### Sample Nginx Configuration Block (`/etc/nginx/sites-available/default`)
```nginx
server {
    listen 80;
    server_name www.pay.sovereigns.ca;
    return 301 https://$host$request_uri; # Force SSL redirect
}

server {
    listen 443 ssl;
    server_name www.pay.sovereigns.ca;

    ssl_certificate /etc/letsencrypt/live/www.pay.sovereigns.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.pay.sovereigns.ca/privkey.pem;

    # Secure TLS configs
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:3000; # Forward requests to your Node Express app
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 4. Production Checklist (Verification Keys)
Before launching, verify these `.env` keys are securely configured on your host server (never commit these keys directly to public repositories):
* `NODE_ENV=production`
* `JWT_SECRET` (generate a secure 32-character random string)
* `SOVEREIGN_ADMIN_EMAILS` (comma-separated list of admin operators)
* `GOOGLE_CLIENT_ID` & `VITE_GOOGLE_CLIENT_ID` (for Google Sign-In)
* `STRIPE_SECRET_KEY` & `STRIPE_PUBLISHABLE_KEY` (for Cash sync integrations)
