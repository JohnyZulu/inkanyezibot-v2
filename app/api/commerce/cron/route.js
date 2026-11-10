// app/api/commerce/cron/route.js — background worker.
// Callers: Supabase pg_cron (every 5 min, Bearer CRON_SECRET), Vercel Cron (daily safety net,
// sends Bearer CRON_SECRET automatically), or the owner's "Run worker now" button.
//   • deliver owner alerts (outbox)   • re-check unpaid payment attempts with Paystack
// (Lapsed stock holds are released by the database itself every minute — 004 Part A — and
//  availability ignores them by clock anyway, so the worker doesn't spend time on it.)
//
// Time budget (Codex reviews P2 + 03): the route must finish inside maxDuration even when the
// database AND Paystack AND the alert webhook are all slow. Every unit of work (one alert, one
// payment check) starts only if its whole worst case — every DB call at its 8s timeout, plus the
// provider call at its timeout — still fits before the work deadline.
//
// Fairness (Codex review 04): one cheap DB call (commerce_worker_plan) says which queues have due
// work and which goes first. When both do, the database alternates strictly between runs. The
// first queue always gets at least one unit, then continues only while leaving room for one whole
// unit of the other queue. Empty queues are skipped entirely (no probes). So under any DB latency
// or alert backlog, each queue gets a guaranteed turn at least every other run.

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { rpc } from '@/lib/commerce/db';
import { reconcilePending, RECONCILE_STEP_MS } from '@/lib/commerce/payments';
import { processJobs, JOB_STEP_MS } from '@/lib/commerce/jobs';
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
    const plan = (await rpc('commerce_worker_plan')) || {};
    const jobs = [];
    const reconciled = [];
    const ALERTS = { name: 'alerts', run: processJobs, out: jobs, limit: 5, step: JOB_STEP_MS,
                     due: plan.alerts_due === true };
    const PAYMENTS = { name: 'payments', run: reconcilePending, out: reconciled, limit: 10, step: RECONCILE_STEP_MS,
                       due: plan.payments_due === true };
    const [first, second] = plan.first === 'alerts' ? [ALERTS, PAYMENTS] : [PAYMENTS, ALERTS];
    const order = ALERTS.due || PAYMENTS.due ? `${first.name} first` : 'idle';

    // Run up to n units of q before `until`; if it stopped early while time remained, it's empty.
    async function serve(q, n, until) {
      if (!q.due || n <= 0) return;
      const got = await q.run(n, until);
      q.out.push(...got);
      if (got.length < n && Date.now() + q.step <= until) q.due = false;
    }
    await serve(first, 1, deadline);                                              // guaranteed turn
    await serve(first, first.limit - first.out.length, second.due ? deadline - second.step : deadline);
    await serve(second, second.limit, deadline);
    await serve(first, first.limit - first.out.length, deadline);                 // top-up with what's left
    // Payments confirmed just now created owner alerts — send them if a whole alert still fits.
    if (reconciled.some((r) => r.outcome === 'applied')) { ALERTS.due = true; await serve(ALERTS, 5, deadline); }

    console.log('[commerce.cron]', actor, { order, reconciled: reconciled.length, jobs: jobs.length, ms: Date.now() - started });
    return NextResponse.json({ ok: true, order, reconciled, jobs, ms: Date.now() - started });
  } catch (err) {
    console.error('[commerce.cron]', err.message);
    return NextResponse.json({ error: 'Worker failed' }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
