// lib/commerce/paystack.js — Paystack adapter (hosted checkout + verify + webhook signature).
// Keep provider specifics here so the provider can be swapped (decision D5 is still "candidate").

import crypto from 'node:crypto';
import { commerceConfig } from './config';

const API = 'https://api.paystack.co';
const TIMEOUT_MS = 15000;

export class PaystackTimeout extends Error {}

async function call(path, init = {}) {
  const { paystackSecret } = commerceConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API + path, {
      ...init,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${paystackSecret}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    return { httpStatus: res.status, body };
  } catch (err) {
    if (err?.name === 'AbortError') throw new PaystackTimeout(`Paystack ${path} timed out`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Create a hosted checkout. amountCents is an integer in cents (R1.00 = 100).
export async function initializeTransaction({ email, amountCents, currency, reference, callbackUrl, metadata }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amountCents must be a positive integer');
  const { httpStatus, body } = await call('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({ email, amount: amountCents, currency, reference, callback_url: callbackUrl, metadata }),
  });
  if (httpStatus !== 200 || body?.status !== true || !body?.data?.authorization_url) {
    return { ok: false, error: `initialize failed (${httpStatus}): ${body?.message || 'no message'}` };
  }
  return { ok: true, authorizationUrl: body.data.authorization_url, accessCode: body.data.access_code };
}

// Ask Paystack directly what happened to a reference. This — not the webhook body —
// is the source of truth for status, amount and currency.
export async function verifyTransaction(reference) {
  const { httpStatus, body } = await call(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
  if (httpStatus === 404 || (httpStatus === 400 && body?.status === false)) {
    return { found: false, message: body?.message || 'not found' };
  }
  if (httpStatus !== 200 || body?.status !== true || !body?.data) {
    throw new Error(`verify failed (${httpStatus}): ${body?.message || 'no message'}`);
  }
  const d = body.data;
  return {
    found: true,
    status: String(d.status),            // success | failed | abandoned | reversed | ...
    amountCents: Number(d.amount),
    currency: String(d.currency || '').toUpperCase(),
    reference: String(d.reference),
    providerTxnId: d.id != null ? String(d.id) : null,
  };
}

// x-paystack-signature = HMAC-SHA512(raw body, secret key), hex. Constant-time compare.
export function verifyWebhookSignature(rawBody, signature, secret = commerceConfig().paystackSecret) {
  if (!signature || typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
