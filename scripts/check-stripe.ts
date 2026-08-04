import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const localEnvPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
} else {
  dotenv.config();
}

const key = process.env.STRIPE_SECRET_KEY || '';

async function checkStripe() {
  if (!key) {
    console.log("Stripe secret key not configured.");
    return;
  }
  
  console.log("Querying Stripe live balance...");
  const stripe = new Stripe(key, { apiVersion: '2024-06-20' as any });
  try {
    const balance = await stripe.balance.retrieve();
    console.log("Stripe balance retrieve result:");
    console.log(JSON.stringify(balance, null, 2));
  } catch (err: any) {
    console.error("Stripe query failed:", err.message || err);
  }
}

checkStripe().catch(console.error);
