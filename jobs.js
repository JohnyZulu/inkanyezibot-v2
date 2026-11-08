// lib/commerce/jobs.js — outbox worker. Jobs are written in the SAME database
// transaction as the business change; this delivers them with retries.
// A failed alert never undoes a payment — it just retries later.

import { rpc } from './db';
import { commerceConfig } from './config';

async function notifyOwnerPaidOrder(payload) {
  const { ownerAlertWebhookUrl, publicBaseUrl } = commerceConfig();
  if (!ownerAlertWebhookUrl) return { skipped: true };           // dashboard still shows the task
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(ownerAlertWebhookUrl, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      // No customer PII in alerts — order number + amount + link only.
      body: JSON.stringify({
        type: 'paid_order',
        order_number: payload.order_number,
        total: (Number(payload.total_cents) / 100).toFixed(2),
        currency: payload.currency,
        on_hold: Boolean(payload.on_hold),
        dashboard: `${publicBaseUrl}/dashboard/commerce`,
      }),
    });
    if (!res.ok) throw new Error(`alert webhook HTTP ${res.status}`);
    return { skipped: false };
  } finally {
    clearTimeout(timer);
  }
}

const HANDLERS = { notify_owner_paid_order: notifyOwnerPaidOrder };

// Deadline-aware (Codex review P2): claims ONE job at a time and only while a full slow
// delivery (JOB_BUDGET_MS) still fits before `deadline` — so it never claims a job it can't
// finish (a claimed-but-abandoned job would sit 'running' for 10 minutes before reclaim).
const JOB_BUDGET_MS = 9000;   // alert webhook timeout (8s) + margin

export async function processJobs(limit = 10, deadline = Date.now() + 30000) {
  const results = [];
  while (results.length < limit && Date.now() + JOB_BUDGET_MS <= deadline) {
    const [job] = (await rpc('commerce_claim_jobs', { p_limit: 1 })) || [];
    if (!job) break;
    const handler = HANDLERS[job.kind];
    try {
      if (!handler) throw new Error(`no handler for ${job.kind}`);
      const r = await handler(job.payload || {});
      await rpc('commerce_complete_job', { p_job_id: job.id, p_ok: true, p_error: null, p_skipped: Boolean(r?.skipped) });
      results.push({ id: job.id, kind: job.kind, outcome: r?.skipped ? 'skipped' : 'done' });
    } catch (err) {
      await rpc('commerce_complete_job', { p_job_id: job.id, p_ok: false, p_error: String(err.message), p_skipped: false });
      results.push({ id: job.id, kind: job.kind, outcome: 'retry' });
    }
  }
  return results;
}
