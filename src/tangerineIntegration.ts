// src/tangerineIntegration.ts
import type { Request, Response } from "express";

const TANGERINE_AUTH_URL = "https://secure.tangerine.ca/oauth/authorize";
const TANGERINE_TOKEN_URL = "https://secure.tangerine.ca/oauth/token";
const TANGERINE_API_BASE = "https://secure.tangerine.ca/api";

const CLIENT_ID = process.env.TANGERINE_CLIENT_ID || "sovereigns_hub";
const CLIENT_SECRET = process.env.TANGERINE_CLIENT_SECRET || "";
const REDIRECT_URI = "https://www.pay.sovereigns.ca/api/v1/interac/callback";

// Simple in-memory token store: userId -> tokens
type TangerineTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope: string;
};

const tokenStore = new Map<string, TangerineTokens>();

// 1) Build the Tangerine OAuth URL for your frontend "Connect Tangerine" button
export function buildTangerineAuthUrl(transferId: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "accounts transfers identity",
    state: transferId,
  });

  return `${TANGERINE_AUTH_URL}?${params.toString()}`;
}

// 2) Callback handler: /api/v1/interac/callback
//    Mount this in your Express app: app.get("/api/v1/interac/callback", tangerineCallbackHandler);
export async function tangerineCallbackHandler(req: any, res: any) {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    // state = transfer_id (TXR-...)
    const transferId = typeof state === "string" ? state : undefined;

    // get the logged-in userId from auth/session
    const userId = req.user?.id || "demo-user-id";

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens for this user
    tokenStore.set(userId, tokens);

    const requestHost = req.headers['x-forwarded-host'] || req.headers.host || 'www.pay.sovereigns.ca';
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const cleanHost = requestHost.includes('localhost') && !requestHost.includes(':') ? `${requestHost}:3000` : requestHost;
    
    return res.redirect(`${protocol}://${cleanHost}/?action=finalize_interac&transfer_id=${transferId}&code=${code}`);
  } catch (err: any) {
    console.error("Tangerine callback error:", err);
    return res.status(500).json({ error: "Failed to complete Tangerine OAuth" });
  }
}

// 3) Exchange authorization code for access/refresh tokens
async function exchangeCodeForTokens(code: string): Promise<TangerineTokens> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
    code,
  });

  const resp = await fetch(TANGERINE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  const json = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  const now = Date.now();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: now + json.expires_in * 1000,
    scope: json.scope,
  };
}

// 4) Helper: ensure we have a valid access token (refresh if needed)
async function getValidAccessToken(userId: string): Promise<string> {
  const tokens = tokenStore.get(userId);
  if (!tokens) {
    throw new Error("No Tangerine tokens for user");
  }

  const now = Date.now();
  if (now < tokens.expiresAt - 60_000) {
    // still valid
    return tokens.accessToken;
  }

  // Fallback to refresh token if available
  if (tokens.refreshToken) {
    try {
      const refreshed = await refreshTangerineTokens(tokens.refreshToken);
      tokenStore.set(userId, refreshed);
      return refreshed.accessToken;
    } catch (err) {
      console.warn("Failed to automatically refresh Tangerine token:", err);
    }
  }

  throw new Error("Access token expired; re-connect Tangerine");
}

// Helper: refresh token exchange
async function refreshTangerineTokens(refreshToken: string): Promise<TangerineTokens> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch(TANGERINE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed: ${resp.status} ${text}`);
  }

  const json = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  const now = Date.now();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || refreshToken,
    expiresAt: now + json.expires_in * 1000,
    scope: json.scope,
  };
}

// 5) Example: get account balance
export async function getTangerineBalance(userId: string) {
  const accessToken = await getValidAccessToken(userId);

  const resp = await fetch(`${TANGERINE_API_BASE}/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Balance fetch failed: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json;
}

// 6) Example: withdraw from Tangerine
export async function withdrawFromTangerine(
  userId: string,
  amount: number,
  destinationIbanOrAccount: string
) {
  const accessToken = await getValidAccessToken(userId);

  const resp = await fetch(`${TANGERINE_API_BASE}/transfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      type: "withdrawal",
      amount,
      destination: destinationIbanOrAccount,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Withdrawal failed: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json;
}

// 7) Example: deposit to Tangerine
export async function depositToTangerine(
  userId: string,
  amount: number,
  sourceIbanOrAccount: string
) {
  const accessToken = await getValidAccessToken(userId);

  const resp = await fetch(`${TANGERINE_API_BASE}/transfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      type: "deposit",
      amount,
      source: sourceIbanOrAccount,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Deposit failed: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json;
}
