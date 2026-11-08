// app/api/commerce/orders/route.js — POST: create order + hosted checkout (owner-only in Milestone 1).
// Later the WhatsApp agent calls lib/commerce/orders.js directly; this route is the browser test path.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/commerce/owner';
import { createOrder, startCheckout } from '@/lib/commerce/orders';
import { ConfigError } from '@/lib/commerce/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  customer: z.object({
    email: z.string().min(3).max(200),
    name: z.string().max(120).optional(),
    phone: z.string().max(30).optional(),
  }),
  items: z.array(z.object({ sku: z.string().min(1).max(41), qty: z.number().int().min(1).max(10) })).min(1).max(20),
  delivery: z.object({
    method: z.enum(['collect', 'courier']),
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    suburb: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    postal_code: z.string().max(10).optional(),
  }),
  expectedTotalCents: z.number().int().positive(),     // the total the customer saw and confirmed
  idempotencyKey: z.string().min(8).max(100),
}).strict();   // unknown fields (e.g. a "price") are rejected outright

export async function POST(req) {
  try {
    const owner = await requireOwner();
    if (!owner.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: owner.status });

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    const b = parsed.data;

    const order = await createOrder({ ...b, actor: `owner:${owner.email}` });
    if (!order?.ok) return NextResponse.json(order, { status: 409 });   // insufficient_stock, total_changed, ...

    const checkout = await startCheckout(order.order_id, `owner:${owner.email}`);
    return NextResponse.json({ order, checkout }, { status: checkout.ok ? 201 : 502 });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error('[commerce.orders] config:', err.message);
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }
    console.error('[commerce.orders]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
