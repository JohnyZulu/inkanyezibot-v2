// app/api/commerce/checkout/route.js — POST {orderId}: new (or reused) hosted checkout for an unpaid order.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/commerce/owner';
import { startCheckout } from '@/lib/commerce/orders';
import { ConfigError } from '@/lib/commerce/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ orderId: z.uuid() }).strict();

export async function POST(req) {
  try {
    const owner = await requireOwner();
    if (!owner.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: owner.status });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const r = await startCheckout(parsed.data.orderId, `owner:${owner.email}`);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (err) {
    console.error('[commerce.checkout]', err instanceof ConfigError ? 'config: ' + err.message : err.message);
    return NextResponse.json({ error: err instanceof ConfigError ? 'Server not configured' : 'Internal error' }, { status: 500 });
  }
}
