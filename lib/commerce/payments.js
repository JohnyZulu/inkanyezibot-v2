// lib/commerce/payments.js — webhook handling + reconciliation.
// Rule: a payment is applied ONLY with facts from Paystack's verify API, and the
// database function applying it is idempotent. Webhook, reconciler and return page
// can all race each other safely.

import { rpc } from './db';
import { verifyTransaction } from './paystack';

// Ask Paystack about one reference and apply the verified result.
export async function reconcileReference(reference, source) {
  const v = await verifyTransaction(reference);
  if (!v.found) return { outcome: 'not_found_at_provider' };
  if (v.reference !== reference) throw new Error('verify returned a different reference');
  return rpc('commerce_apply_verified_payment', {
    p_reference: reference,
    p_provider_status: v.status,
    p_amount_cents: v.amountCents,
    p_currency: v.currency,
    p_provider_txn_id: v.providerTxnId,
    p_source: source,
  });
}

// Called by the webhook route AFTER the signature has been verified.
export async function handlePaystackEvent(evt) {
  const type = String(evt?.event || 'unknown');
  const data = evt?.data || {};
  const reference = data.reference ? String(data.reference) : null;
  const dedupKey = `paystack:${type}:${data.id ?? reference ?? 'none'}`;

  const rec = await rpc('commerce_record_payment_event', {
    p_provider: 'paystack', p_dedup_key: dedupKey, p_event_type: type, p_reference: reference, p_payload: evt,
  });
  if (rec.already_processed) return { outcome: 'duplicate_event' };

  let outcome = 'ignored';
  if (type === 'charge.success' && reference) {
    const r = await reconcileReference(reference, 'webhook');   // throws on transient failure → route returns 500 → Paystack retries
    outcome = r?.outcome || 'unknown';
  }
  await rpc('commerce_mark_event_processed', { p_event_id: rec.event_id, p_outcome: outcome });
  console.log('[paystack.webhook]', type, reference, outcome);   // no PII
  return { outcome };
}

// Safety net for missed/late webhooks.
//  • One at a time: the database hands out ONE attempt per claim, least-recently-checked first,
//    so nothing is ever claimed-then-skipped (Codex review 02, finding 2).
//  • Leased: each claim has a token + expiring lease, so an overlapping worker run can't check
//    the same attempt while we're waiting on Paystack (finding 3).
//  • Budgeted end to end (Codex review 03): a step starts only if its WHOLE worst case fits —
//    claim RPC + Paystack verify + apply RPC + release RPC, each at its timeout.
const RPC_MAX_MS = 8000;          // = DB_TIMEOUT_MS in db.js
const VERIFY_MAX_MS = 15000;      // = Paystack TIMEOUT_MS in paystack.js
export const RECONCILE_STEP_MS = RPC_MAX_MS + VERIFY_MAX_MS + RPC_MAX_MS + RPC_MAX_MS + 1000;   // 40s
const LEASE_SECONDS = 60;         // > RECONCILE_STEP_MS, so a lease never lapses mid-step

export async function reconcilePending(limit = 10, deadline = Date.now() + 30000) {
  const results = [];
  while (results.length < limit && Date.now() + RECONCILE_STEP_MS <= deadline) {
    const [claim] = (await rpc('commerce_claim_reconcile_attempt', { p_lease_seconds: LEASE_SECONDS })) || [];
    if (!claim) break;
    try {
      const r = await reconcileReference(claim.reference, 'reconcile');
      results.push({ reference: claim.reference, outcome: r?.outcome });
    } catch (err) {
      results.push({ reference: claim.reference, outcome: 'error', error: String(err.message).slice(0, 120) });
    } finally {
      await rpc('commerce_release_reconcile_claim', { p_reference: claim.reference, p_claim_token: claim.claim_token })
        .catch((e) => console.error('[commerce.reconcile] release failed (lease will expire):', e.message));
    }
  }
  return results;
}
