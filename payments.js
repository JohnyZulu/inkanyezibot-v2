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

// Safety net for missed/late webhooks. Deadline-aware (Codex review P2): it only starts a
// Paystack check if a full slow check (VERIFY_BUDGET_MS) still fits before `deadline`.
// The database hands out attempts in fair rotation (least-recently-checked first). Any attempt
// we claimed but had no time for is handed back unchecked, so it goes to the front next run.
const VERIFY_BUDGET_MS = 16000;   // Paystack call timeout (15s) + margin

export async function reconcilePending(limit = 10, deadline = Date.now() + 30000) {
  if (Date.now() + VERIFY_BUDGET_MS > deadline) return [];
  const rows = (await rpc('commerce_list_reconcilable_attempts', { p_limit: limit })) || [];
  const results = [];
  const deferred = [];
  for (const row of rows) {
    if (Date.now() + VERIFY_BUDGET_MS > deadline) {
      deferred.push(row.reference);
      results.push({ reference: row.reference, outcome: 'deferred' });
      continue;
    }
    try {
      const r = await reconcileReference(row.reference, 'reconcile');
      results.push({ reference: row.reference, outcome: r?.outcome });
    } catch (err) {
      results.push({ reference: row.reference, outcome: 'error', error: String(err.message).slice(0, 120) });
    }
  }
  if (deferred.length) await rpc('commerce_unclaim_reconcile', { p_references: deferred });
  return results;
}
