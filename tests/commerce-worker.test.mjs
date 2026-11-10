// No npm dependencies. Run: node --experimental-vm-modules --test tests/commerce-worker.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function sandbox({ attempts = 20, alertCount = 10, rpcDelayMs = 0, verifySucceeds = false,
                         refillAlerts = false, recurringAttempts = false } = {}) {
  let clock = 0;
  const calls = [];
  // lastChecked: when the reconciler last claimed it (null = never). createdAt 0 = eligible from the start.
  const references = Array.from({ length: attempts }, (_, i) => ({ reference: `REVIEW-${i}`, lastChecked: null }));
  const jobs = Array.from({ length: alertCount }, (_, i) => ({
    id: i + 1, kind: 'notify_owner_paid_order', payload: {}, status: 'pending', dueAt: 0,
  }));
  const claims = [];
  const released = [];
  let lastFirst = null;   // commerce.worker_state
  const context = vm.createContext({
    Buffer, AbortController,
    console: { log() {}, warn() {}, error() {} },
    Date: class extends Date { static now() { return clock; } },
    // A successful verify finishes just before its 15s timeout; other providers time out.
    // No real network or wall-clock waits.
    setTimeout(callback, ms) {
      if (verifySucceeds && ms === 15000) { clock += 14900; return 1; }
      clock += ms;
      callback();
      return 1;
    },
    clearTimeout() {},
    async fetch(_url, { signal }) {
      if (verifySucceeds && _url.startsWith('https://api.paystack.co/transaction/verify/')) {
        return {
          status: 200,
          json: async () => ({ status: true, data: {
            status: 'success', reference: decodeURIComponent(_url.split('/').at(-1)),
            amount: 100, currency: 'ZAR', id: 1,
          } }),
        };
      }
      assert.equal(signal.aborted, true);
      const err = new Error('Provider timeout');
      err.name = 'AbortError';
      throw err;
    },
  });
  async function rpc(name, args = {}) {
    clock += rpcDelayMs;
    calls.push({ name, args });
    if (name === 'commerce_apply_verified_payment') return { outcome: 'applied' };
    if (name === 'commerce_release_expired_reservations') return 0;
    if (name === 'commerce_worker_plan') {
      // Mirrors the SQL: which queues have due work; strict alternation when both do.
      const alerts_due = jobs.some(j => j.status === 'pending');
      const payments_due = references.length > 0;
      let first = null;
      if (alerts_due && payments_due) first = lastFirst = lastFirst === 'alerts' ? 'payments' : 'alerts';
      else if (alerts_due) first = 'alerts';
      else if (payments_due) first = 'payments';
      return { alerts_due, payments_due, first };
    }
    if (name === 'commerce_claim_reconcile_attempt') {
      // Least-recently-checked first (never-checked first), like the SQL.
      const next = recurringAttempts
        ? [...references].sort((a, b) => (a.lastChecked ?? -1) - (b.lastChecked ?? -1))[0]
        : references.shift();
      if (!next) return [];
      next.lastChecked = clock;
      const claim = { reference: next.reference, claim_token: `token-${claims.length}` };
      claims.push(claim);
      return [claim];
    }
    if (name === 'commerce_release_reconcile_claim') { released.push(args); return true; }
    if (name === 'commerce_claim_jobs') {
      const claimed = jobs.filter(j => j.status === 'pending')
        .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id).slice(0, args.p_limit);   // oldest due first, like the SQL
      claimed.forEach(j => { j.status = 'running'; });
      // refillAlerts: a busy shop — a new alert becomes due every time one is claimed.
      if (refillAlerts) claimed.forEach(() => jobs.push({ id: jobs.length + 1, kind: 'notify_owner_paid_order',
                                                        payload: {}, status: 'pending', dueAt: clock }));
      return claimed;
    }
    if (name === 'commerce_complete_job') {
      jobs.find(j => j.id === args.p_job_id).status = args.p_ok ? 'done' : 'backoff';
      return;
    }
    throw new Error(`Unexpected RPC: ${name}`);
  }
  function synthetic(name, exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: name });
  }
  const mocks = {
    db: synthetic('db', { rpc }),
    config: synthetic('config', { commerceConfig: () => ({
      paystackSecret: 'sk_test_review_only', cronSecret: 'test-cron',
      ownerAlertWebhookUrl: 'https://example.invalid/test-alert', publicBaseUrl: 'https://example.invalid',
    }) }),
    owner: synthetic('owner', { requireOwner: async () => ({ ok: false }) }),
    'node:crypto': synthetic('crypto', { default: crypto }),
    'next/server': synthetic('next', { NextResponse: { json: (body, init) => ({ body, ...init }) } }),
  };
  const files = {
    cron: 'app/api/commerce/cron/route.js',
    payments: 'lib/commerce/payments.js',
    jobs: 'lib/commerce/jobs.js',
    paystack: 'lib/commerce/paystack.js',
  };
  const modules = {};
  async function load(name) {
    if (mocks[name]) return mocks[name];
    if (modules[name]) return modules[name];
    const mod = new vm.SourceTextModule(await readFile(path.join(root, files[name]), 'utf8'), {
      context, identifier: files[name],
    });
    modules[name] = mod;
    await mod.link(specifier => load(specifier.startsWith('.') || specifier.startsWith('@/')
      ? path.basename(specifier, '.js') : specifier));
    return mod;
  }
  return {
    async run(name) {
      const mod = await load(name);
      await mod.evaluate();
      return mod.namespace;
    },
    calls, jobs, claims, released, references, get elapsed() { return clock; },
  };
}

test('worker finishes hanging providers inside its 60s route limit and releases every claim', async () => {
  const s = await sandbox();
  const cron = await s.run('cron');
  const response = await cron.GET({ headers: new Headers({ authorization: 'Bearer test-cron' }) });
  assert.equal(response.body.ok, true);
  const summary = {
    elapsedMs: s.elapsed, running: s.jobs.filter(j => j.status === 'running').length,
    claimed: s.claims.length,
    released: s.released.length,
    firstWork: s.calls.find(c => ['commerce_claim_jobs', 'commerce_claim_reconcile_attempt'].includes(c.name)).name,
  };
  console.log('worker summary:', summary);
  assert.ok(s.elapsed < cron.maxDuration * 1000, `worker took ${s.elapsed}ms with both providers timing out`);
  assert.equal(summary.running, 0);
  assert.ok(summary.claimed > 0 && summary.claimed < 20, 'claims only what it can verify; the rest stays free for the next run');
  assert.equal(summary.released, summary.claimed, 'every claimed attempt must be released with its own token');
  assert.deepEqual(s.released.map(r => r.p_claim_token), s.claims.map(c => c.claim_token));
  assert.equal(summary.firstWork, 'commerce_claim_jobs', 'alerts must get a turn before slow verification');
});

test('job processing claims no work when a full delivery cannot fit', async () => {
  const s = await sandbox({ attempts: 0, alertCount: 3 });
  const jobs = await s.run('jobs');
  await jobs.processJobs(3, 8000);
  assert.equal(s.calls.length, 0, 'must not claim jobs if less than 9s remains');
});

test('reconciliation claims no work when a full verify cannot fit', async () => {
  const s = await sandbox({ attempts: 3, alertCount: 0 });
  const payments = await s.run('payments');
  await payments.reconcilePending(3, 15000);
  assert.equal(s.calls.length, 0, 'must not claim attempts if less than 16s remains');
});

test('webhook signature accepts the raw-body HMAC and rejects wrong length/value', async () => {
  const s = await sandbox();
  const { verifyWebhookSignature } = await s.run('paystack');
  const body = '{"event":"charge.success","data":{"reference":"REVIEW"}}\n';
  const secret = 'sk_test_unit_only';
  const signature = crypto.createHmac('sha512', secret).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(body, signature.slice(1), secret), false);
  assert.equal(verifyWebhookSignature(body, '0'.repeat(128), secret), false);
  assert.equal(verifyWebhookSignature(body.trim(), signature, secret), false);
});

test('worker budget includes slow successful DB calls and successful verification', async () => {
  const s = await sandbox({ rpcDelayMs: 7000, verifySucceeds: true });
  const cron = await s.run('cron');
  const response = await cron.GET({ headers: new Headers({ authorization: 'Bearer test-cron' }) });
  assert.equal(response.body.ok, true);
  console.log('slow DB summary:', { elapsed: s.elapsed, response: response.body });
  assert.ok(s.elapsed < cron.maxDuration * 1000, `worker took ${s.elapsed}ms although every DB call finished in 7s, inside the 8s timeout`);
});

test('worker stays inside maxDuration for every DB latency up to the 8s timeout, and still makes progress', async () => {
  const worst = [];
  for (let rpcDelayMs = 0; rpcDelayMs <= 8000; rpcDelayMs += 500) {
    for (const verifySucceeds of [false, true]) {
      const s = await sandbox({ rpcDelayMs, verifySucceeds });
      const cron = await s.run('cron');
      const response = await cron.GET({ headers: new Headers({ authorization: 'Bearer test-cron' }) });
      assert.equal(response.body.ok, true);
      const label = `rpc=${rpcDelayMs}ms verify=${verifySucceeds ? 'ok@14.9s' : 'timeout'}`;
      assert.ok(s.elapsed < cron.maxDuration * 1000, `${label}: took ${s.elapsed}ms`);
      assert.equal(s.jobs.filter(j => j.status === 'running').length, 0, `${label}: job left running`);
      assert.deepEqual(s.released.map(r => r.p_claim_token), s.claims.map(c => c.claim_token), `${label}: claim not released`);
      const progress = s.claims.length + s.jobs.filter(j => j.status !== 'pending').length;
      assert.ok(progress > 0, `${label}: made no progress at all`);
      worst.push({ label, elapsed: s.elapsed });
    }
  }
  const max = worst.reduce((a, b) => (b.elapsed > a.elapsed ? b : a));
  console.log('slowest combination:', max);
});

test('busy shop + slow DB: alerts and payment checks both progress every two runs, never starve', async () => {
  for (let rpcDelayMs = 0; rpcDelayMs <= 8000; rpcDelayMs += 1000) {
    for (const verifySucceeds of [false, true]) {
      // Alerts keep arriving and 3 unpaid attempts stay pending forever: both queues are never empty.
      const s = await sandbox({ attempts: 3, alertCount: 3, rpcDelayMs, verifySucceeds,
                                refillAlerts: true, recurringAttempts: true });
      const cron = await s.run('cron');
      const label = `rpc=${rpcDelayMs}ms verify=${verifySucceeds ? 'ok' : 'timeout'}`;
      const perRun = [];
      for (let run = 0; run < 8; run++) {
        const start = s.elapsed, claimsBefore = s.claims.length;
        const alertsBefore = s.jobs.filter(j => j.status !== 'pending').length;
        const response = await cron.GET({ headers: new Headers({ authorization: 'Bearer test-cron' }) });
        assert.equal(response.body.ok, true, label);
        assert.ok(s.elapsed - start < cron.maxDuration * 1000, `${label} run ${run}: ${s.elapsed - start}ms`);
        perRun.push({ payments: s.claims.length - claimsBefore,
                      alerts: s.jobs.filter(j => j.status !== 'pending').length - alertsBefore });
        s.jobs.filter(j => j.status === 'backoff').forEach(j => { j.status = 'pending'; j.dueAt = s.elapsed; }); // backoff ends
      }
      // Starvation check: in every window of two consecutive runs, each queue got at least one unit.
      for (let i = 0; i + 1 < perRun.length; i++) {
        assert.ok(perRun[i].payments + perRun[i + 1].payments > 0, `${label}: payments starved in runs ${i}-${i + 1}`);
        assert.ok(perRun[i].alerts + perRun[i + 1].alerts > 0, `${label}: alerts starved in runs ${i}-${i + 1}`);
      }
      // Fair rotation across the 3 recurring attempts: every one gets checked.
      assert.equal(s.references.filter(r => r.lastChecked !== null).length, 3, `${label}: an attempt was never checked`);
      assert.deepEqual(s.released.map(r => r.p_claim_token), s.claims.map(c => c.claim_token), `${label}: claim not released`);
    }
  }
});
