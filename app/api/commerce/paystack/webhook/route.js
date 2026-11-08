// app/api/commerce/paystack/webhook/route.js — Paystack → us. Public URL, trust = signature only.
//   1. HMAC-SHA512 signature over the RAW body (reject if wrong — nothing is stored)
//   2. store the event once (dedup)   3. verify with Paystack's API   4. apply idempotently
// 200 = processed (or harmless duplicate). 500 = transient failure → Paystack retries.

import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/commerce/paystack';
import { handlePaystackEvent } from '@/lib/commerce/payments';
import { processJobs } from '@/lib/commerce/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const raw = await req.text();
  let valid = false;
  try {
    valid = verifyWebhookSignature(raw, req.headers.get('x-paystack-signature'));
  } catch (err) {
    console.error('[paystack.webhook] config:', err.message);
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  if (!valid) {
    console.warn('[paystack.webhook] rejected: bad signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  try {
    const r = await handlePaystackEvent(evt);
    // Best effort: send the owner alert now instead of waiting for the next worker run.
    if (r.outcome === 'applied') await processJobs(3).catch((e) => console.error('[paystack.webhook] jobs:', e.message));
    return NextResponse.json({ received: true, outcome: r.outcome });
  } catch (err) {
    console.error('[paystack.webhook] processing failed:', err.message);
    return NextResponse.json({ error: 'Temporary failure' }, { status: 500 });
  }
}
