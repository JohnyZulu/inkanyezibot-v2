// app/api/commerce/cron/route.js — background worker.
// Callers: Supabase pg_cron (every 5 min, Bearer CRON_SECRET), Vercel Cron (daily safety net,
// sends Bearer CRON_SECRET automatically), or the owner's "Run worker now" button.
//   • release lapsed stock holds   • deliver owner alerts   • reconcile unpaid attempts with Paystack
//
// Time budget (Codex reviews P2 + 03): the route must finish inside maxDuration even when the
// database AND Paystack AND the alert webhook are all slow. Every unit of work (one alert, one
// payment check) starts only if its whole worst case — every DB call at its 8s timeout, plus the
// provider call at its timeout — still fits before the work deadline. The first DB call (release
// holds) is itself at most 8s. Anything not reached is first in line next run (fair rotation).

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

const WORK_BUDGET_MS = 50000;   // every claimed unit finishes by here; 10s left for auth + response

function bearerMatches(req, secret) {
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') || '', 'utf8');
  const want = Buffer.from(`Bearer ${secret}`, 'utf8');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

async function run(req) {
  const started = Date.now();
  const deadline = started + WORK_BUDGET_MS;
  try {
    const { cronSecret } = commerceConfig();
    let actor = 'cron';
    if (!bearerMatches(req, cronSecret)) {
      const owner = await requireOwner();
      if (!owner.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      actor = `owner:${owner.email}`;
    }
    const released = await rpc('commerce_release_expired_reservations');
    // Alerts first, with a capped share of the budget, so a Paystack outage can't starve them.
    const jobsBefore = await processJobs(5, Math.min(deadline, Date.now() + 30000));
    const reconciled = await reconcilePending(10, deadline);
    // Payments applied just now created new alert jobs — send them if time remains.
    const jobsAfter = await processJobs(5, deadline);
    const jobs = [...jobsBefore, ...jobsAfter];
    console.log('[commerce.cron]', actor, { released, reconciled: reconciled.length, jobs: jobs.length, ms: Date.now() - started });
    return NextResponse.json({ ok: true, released, reconciled, jobs, ms: Date.now() - started });
  } catch (err) {
    console.error('[commerce.cron]', err.message);
    return NextResponse.json({ error: 'Worker failed' }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
