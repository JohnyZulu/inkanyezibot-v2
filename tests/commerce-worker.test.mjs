// No npm dependencies. Run: node --experimental-vm-modules --test tests/commerce-worker.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function sandbox({ attempts = 20, alertCount = 10 } = {}) {
  let clock = 0;
  const calls = [];
  const references = Array.from({ length: attempts }, (_, i) => ({ reference: `REVIEW-${i}` }));
  const jobs = Array.from({ length: alertCount }, (_, i) => ({
    id: i + 1, kind: 'notify_owner_paid_order', payload: {}, status: 'pending',
  }));
  const claims = [];
  const released = [];
  const context = vm.createContext({
    Buffer, AbortController,
    console: { log() {}, warn() {}, error() {} },
    Date: class extends Date { static now() { return clock; } },
    // Advance virtual time to each provider timeout; no real network or wall-clock waits.
    setTimeout(callback, ms) { clock += ms; callback(); return 1; },
    clearTimeout() {},
    async fetch(_url, { signal }) {
      assert.equal(signal.aborted, true);
      const err = new Error('Provider timeout');
      err.name = 'AbortError';
      throw err;
    },
  });
  async function rpc(name, args = {}) {
    calls.push({ name, args });
    if (name === 'commerce_release_expired_reservations') return 0;
    if (name === 'commerce_claim_reconcile_attempt') {
      const next = references.shift();
      if (!next) return [];
      const claim = { reference: next.reference, claim_token: `token-${claims.length}` };
      claims.push(claim);
      return [claim];
    }
    if (name === 'commerce_release_reconcile_claim') { released.push(args); return true; }
    if (name === 'commerce_claim_jobs') {
      const claimed = jobs.filter(j => j.status === 'pending').slice(0, args.p_limit);
      claimed.forEach(j => { j.status = 'running'; });
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
    calls, jobs, claims, released, get elapsed() { return clock; },
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
