// lib/commerce/orders.js — create order (DB) → start payment attempt (DB) → hosted checkout (Paystack).
// The future WhatsApp agent's create_checkout_link tool will call these same functions.

import { rpc } from './db';
import { commerceConfig } from './config';
import { initializeTransaction, PaystackTimeout } from './paystack';

export async function createOrder({ customer, items, delivery, expectedTotalCents, idempotencyKey, actor }) {
  const { storeSlug } = commerceConfig();
  return rpc('commerce_create_order', {
    p_store_slug: storeSlug,
    p_customer: customer,
    p_items: items,
    p_delivery: delivery,
    p_expected_total_cents: expectedTotalCents ?? null,
    p_idempotency_key: idempotencyKey ?? null,
    p_actor: actor,
  });
}

export async function startCheckout(orderId, actor) {
  const { publicBaseUrl } = commerceConfig();
  const attempt = await rpc('commerce_start_payment_attempt', { p_order_id: orderId, p_actor: actor });
  if (!attempt?.ok) return attempt;                                   // e.g. reservation_expired
  if (attempt.reused) return { ok: true, reference: attempt.reference, checkoutUrl: attempt.authorization_url };

  let init;
  try {
    init = await initializeTransaction({
      email: attempt.email,
      amountCents: Number(attempt.amount_cents),
      currency: attempt.currency,
      reference: attempt.reference,
      callbackUrl: `${publicBaseUrl}/pay/return`,
      metadata: { order_number: attempt.order_number, attempt_id: attempt.attempt_id },
    });
  } catch (err) {
    // Timeout = we don't know if Paystack created it → 'unknown' (the reconciler asks Paystack later).
    const status = err instanceof PaystackTimeout ? 'unknown' : 'failed';
    await rpc('commerce_mark_attempt', { p_reference: attempt.reference, p_status: status, p_error: String(err.message) });
    return { ok: false, code: 'checkout_unavailable', reference: attempt.reference };
  }

  if (!init.ok) {
    await rpc('commerce_mark_attempt', { p_reference: attempt.reference, p_status: 'failed', p_error: init.error });
    return { ok: false, code: 'checkout_unavailable', reference: attempt.reference };
  }

  await rpc('commerce_attach_checkout', {
    p_attempt_id: attempt.attempt_id,
    p_authorization_url: init.authorizationUrl,
    p_access_code: init.accessCode,
  });
  return { ok: true, reference: attempt.reference, checkoutUrl: init.authorizationUrl };
}
