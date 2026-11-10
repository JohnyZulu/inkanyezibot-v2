// lib/commerce/config.js — reads commerce env vars once, fails closed.
// Milestone 1 is TEST MODE ONLY: a live Paystack key is refused unless
// COMMERCE_ALLOW_LIVE=true is deliberately set (do not set it until go-live review).

export class ConfigError extends Error {}

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new ConfigError(`Missing env var: ${name}`);
  return v.trim();
}

export function commerceConfig() {
  const paystackSecret = required('PAYSTACK_SECRET_KEY');
  const allowLive = process.env.COMMERCE_ALLOW_LIVE === 'true';
  if (!paystackSecret.startsWith('sk_test_') && !allowLive) {
    throw new ConfigError('PAYSTACK_SECRET_KEY is not a test key (sk_test_…). Live keys are blocked in Milestone 1.');
  }
  return {
    supabaseUrl: required('SUPABASE_URL'),
    supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
    paystackSecret,
    storeSlug: required('COMMERCE_STORE_SLUG'),
    publicBaseUrl: required('PUBLIC_BASE_URL').replace(/\/+$/, ''),
    ownerEmails: required('OWNER_EMAILS').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    cronSecret: process.env.CRON_SECRET?.trim() || null,
    ownerAlertWebhookUrl: process.env.OWNER_ALERT_WEBHOOK_URL?.trim() || null,
    testMode: paystackSecret.startsWith('sk_test_'),
  };
}
