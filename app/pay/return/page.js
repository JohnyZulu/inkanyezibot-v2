// app/pay/return/page.js — where Paystack sends the customer after checkout.
// The ?reference= in the URL proves NOTHING by itself; we ask Paystack server-side
// (idempotent) and only then say "confirmed". No customer details are shown.

import { reconcileReference } from '@/lib/commerce/payments';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment status — Inkanyezi', robots: { index: false } };

const REF = /^[A-Z]{2,6}-\d{6}-\d$/;

export default async function PayReturn({ searchParams }) {
  const params = await searchParams;
  const reference = String(params?.reference || params?.trxref || '');
  const orderNumber = REF.test(reference) ? reference.replace(/-\d$/, '') : null;

  let state = 'invalid';
  if (orderNumber) {
    try {
      const r = await reconcileReference(reference, 'return_page');
      if (['applied', 'duplicate', 'duplicate_payment'].includes(r?.outcome)) state = 'confirmed';
      else if (r?.outcome === 'mismatch_held' || r?.outcome === 'already_held') state = 'review';
      else if (r?.outcome === 'attempt_failed') state = 'failed';
      else state = 'pending';
    } catch {
      state = 'pending';
    }
  }

  const copy = {
    confirmed: ['Payment confirmed', `Thank you — order ${orderNumber} is paid and is being prepared.`],
    pending:   ['Confirming your payment', `We haven't received confirmation for order ${orderNumber} yet. This can take a minute — you'll get a message as soon as it's confirmed. Please don't pay twice.`],
    review:    ['We are checking your payment', `Order ${orderNumber}: something about this payment needs a quick check by our team. We'll contact you — please don't pay again.`],
    failed:    ['Payment not completed', `The payment for order ${orderNumber} didn't go through. No money was taken for this attempt.`],
    invalid:   ['Payment status', 'We could not read a payment reference from this link.'],
  }[state];

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 440, width: '100%', border: '1px solid #ddd', borderRadius: 12, padding: 24 }}>
        <p style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Inkanyezi</p>
        <h1 style={{ fontSize: 22, margin: '8px 0 12px' }}>{copy[0]}</h1>
        <p style={{ lineHeight: 1.5, margin: 0 }}>{copy[1]}</p>
      </div>
    </main>
  );
}
