// app/api/commerce/admin/overview/route.js — GET: products/stock, recent orders, open tasks (owner-only).

import { NextResponse } from 'next/server';
import { rpc } from '@/lib/commerce/db';
import { requireOwner } from '@/lib/commerce/owner';
import { commerceConfig, ConfigError } from '@/lib/commerce/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const owner = await requireOwner();
    if (!owner.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: owner.status });
    const { storeSlug, testMode } = commerceConfig();
    const data = await rpc('commerce_owner_overview', { p_store_slug: storeSlug });
    return NextResponse.json({ ...data, testMode });
  } catch (err) {
    console.error('[commerce.overview]', err instanceof ConfigError ? 'config: ' + err.message : err.message);
    return NextResponse.json({ error: err instanceof ConfigError ? 'Server not configured: ' + err.message : 'Internal error' },
                             { status: 500 });
  }
}
