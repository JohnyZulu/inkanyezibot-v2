// app/api/commerce/cron/route.js — background worker.
// Callers: Supabase pg_cron (every 5 min, Bearer CRON_SECRET), Vercel Cron (daily safety net,
// sends Bearer CRON_SECRET automatically), or the owner's "Run worker now" button.
//   • release lapsed stock holds   • reconcile unpaid attempts with Paystack   • deliver outbox jobs

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { rpc } from '@/lib/commerce/db';
import { reconcilePending } from '@/lib/commerce/payments';
import { processJobs } from '@/lib/commerce/jobs';
import { requireOwner } from '@/lib/commerce/owner';
import { commerceConfig } from '@/lib/commerce/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function bearerMatches(req, secret) {
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') || '', 'utf8');
  const want = Buffer.from(`Bearer ${secret}`, 'utf8');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

async function run(req) {
  try {
    const { cronSecret } = commerceConfig();
    let actor = 'cron';
    if (!bearerMatches(req, cronSecret)) {
      const owner = await requireOwner();
      if (!owner.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      actor = `owner:${owner.email}`;
    }
    const released = await rpc('commerce_release_expired_reservations');
    const reconciled = await reconcilePending(20);
    const jobs = await processJobs(10);
    console.log('[commerce.cron]', actor, { released, reconciled: reconciled.length, jobs: jobs.length });
    return NextResponse.json({ ok: true, released, reconciled, jobs });
  } catch (err) {
    console.error('[commerce.cron]', err.message);
    return NextResponse.json({ error: 'Worker failed' }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
