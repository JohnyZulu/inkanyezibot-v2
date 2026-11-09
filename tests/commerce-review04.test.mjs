// Additional Task 04 checks; the six supplied files remain byte-for-byte unchanged.
// Run: node --experimental-vm-modules --test tests/commerce-review04.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Reuse the supplied virtual worker environment without registering its six tests again.
// Only an export is appended to its test source; production source is evaluated unchanged.
async function workerSandbox(options) {
  const filename = path.join(root, 'tests/commerce-worker.test.mjs');
  const context = vm.createContext({ Buffer, AbortController, Headers, Date, console });
  const helper = new vm.SourceTextModule(`${await readFile(filename, 'utf8')}\nexport { sandbox };`, {
    context, identifier: filename,
    initializeImportMeta(meta) { meta.url = pathToFileURL(filename).href; },
  });
  const imports = new Map();
  await helper.link(async specifier => {
    assert.ok(specifier.startsWith('node:'));
    if (!imports.has(specifier)) {
      const namespace = specifier === 'node:test' ? { default() {} } : await import(specifier);
      const imported = new vm.SyntheticModule(Object.keys(namespace), function () {
        for (const [name, value] of Object.entries(namespace)) this.setExport(name, value);
      }, { context, identifier: specifier });
      imports.set(specifier, imported);
    }
    return imports.get(specifier);
  });
  await helper.evaluate();
  return helper.namespace.sandbox(options);
}

test('reconciliation progresses across slow-DB runs when the alert queue is empty', async () => {
  const s = await workerSandbox({ attempts: 3, alertCount: 0, rpcDelayMs: 6000, verifySucceeds: true });
  const cron = await s.run('cron');
  const runs = [];
  for (let run = 0; run < 5; run++) {
    const start = s.elapsed;
    const response = await cron.GET({ headers: new Headers({ authorization: 'Bearer test-cron' }) });
    assert.equal(response.body.ok, true);
    runs.push({ duration: s.elapsed - start, reconciled: response.body.reconciled.length });
  }
  console.log('empty-alert queue / 6s DB runs:', runs, 'claims:', s.claims.length);
  assert.ok(s.claims.length > 0, 'pending payments must be checked even when DB calls consistently take 6s');
});

test('reconciliation progresses after the initial due alerts have been processed', async () => {
  const s = await workerSandbox({ attempts: 3, alertCount: 2, rpcDelayMs: 6000, verifySucceeds: true });
  const cron = await s.run('cron');
  const runs = [];
  for (let run = 0; run < 6; run++) {
    const start = s.elapsed;
    const response = await cron.GET({ headers: new Headers({ authorization: 'Bearer test-cron' }) });
    assert.equal(response.body.ok, true);
    runs.push({ duration: s.elapsed - start, reconciled: response.body.reconciled.length });
  }
  // Supplied sandbox moves failed alerts to backoff, so none remains due.
  assert.equal(s.jobs.filter(j => j.status === 'pending').length, 0);
  console.log('drained-alert queue / 6s DB runs:', runs, 'claims:', s.claims.length);
  assert.ok(s.claims.length > 0, 'draining alerts must eventually leave a reconciliation opportunity');
});

async function webhookSandbox({ beforeResponseMs, afterDelayMs = 0, failFirstCompletion = false }) {
  let clock = 0;
  const callbacks = [], calls = [];
  let status = 'pending';
  let completions = 0;
  const context = vm.createContext({
    Buffer, AbortController,
    console: { log() {}, warn() {}, error() {} },
    Date: class extends Date { static now() { return clock; } },
    setTimeout(callback, ms) {
      if (failFirstCompletion) { clock += ms - 100; return 1; } // successful delivery before abort
      clock += ms; callback(); return 1;
    },
    clearTimeout() {},
    async fetch(_url, { signal }) {
      if (failFirstCompletion) return { ok: true };
      assert.equal(signal.aborted, true);
      throw new Error('Alert timeout');
    },
  });
  function synthetic(name, values) {
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context, identifier: name });
  }
  const mocks = {
    db: synthetic('db', { rpc: async (name, args) => {
      clock += 8000;
      calls.push({ name, args });
      if (name === 'commerce_claim_jobs') {
        status = 'running';
        return [{ id: 1, kind: 'notify_owner_paid_order', payload: {} }];
      }
      assert.equal(name, 'commerce_complete_job');
      if (failFirstCompletion && ++completions === 1) throw new Error('DB completion response failed');
      status = args.p_ok ? 'done' : 'backoff';
    } }),
    config: synthetic('config', { commerceConfig: () => ({
      ownerAlertWebhookUrl: 'https://example.invalid/test-alert', publicBaseUrl: 'https://example.invalid',
    }) }),
    paystack: synthetic('paystack', { verifyWebhookSignature: () => true }),
    payments: synthetic('payments', { handlePaystackEvent: async () => {
      clock += beforeResponseMs;
      return { outcome: 'applied' };
    } }),
    'next/server': synthetic('next/server', {
      NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
      after: callback => callbacks.push(callback),
    }),
  };
  const files = { webhook: 'app/api/commerce/paystack/webhook/route.js', jobs: 'lib/commerce/jobs.js' };
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
  const webhook = await load('webhook');
  await webhook.evaluate();
  return {
    webhook: webhook.namespace, calls, callbacks,
    get elapsed() { return clock; }, get status() { return status; },
    async runAfterResponse() {
      clock += afterDelayMs;
      for (const callback of callbacks) await callback();
    },
  };
}

test('webhook sends its response before the owner alert; after work stays below maxDuration', async () => {
  const s = await webhookSandbox({ beforeResponseMs: 25000 });
  const response = await s.webhook.POST({ text: async () => '{}', headers: new Headers() });
  assert.equal(response.status, 200);
  assert.equal(s.elapsed, 25000);
  assert.equal(s.calls.length, 0, 'outbox must not be claimed before the response');
  assert.equal(s.callbacks.length, 1);
  await s.runAfterResponse();
  assert.equal(s.elapsed, 49000);
  assert.notEqual(s.status, 'running');
  assert.ok(s.elapsed < s.webhook.maxDuration * 1000);
});

test('late webhook after callback leaves the alert for cron instead of extending its deadline', async () => {
  for (const timing of [
    { beforeResponseMs: 25000, afterDelayMs: 1000 },
    { beforeResponseMs: 39000 }, // three bounded DB calls plus a slow verify before response
  ]) {
    const s = await webhookSandbox(timing);
    const response = await s.webhook.POST({ text: async () => '{}', headers: new Headers() });
    assert.equal(response.status, 200);
    await s.runAfterResponse();
    assert.equal(s.calls.length, 0);
    assert.equal(s.status, 'pending');
    assert.ok(s.elapsed < s.webhook.maxDuration * 1000);
  }
});

test('webhook completion-RPC retry still fits the maxDuration headroom', async () => {
  const s = await webhookSandbox({ beforeResponseMs: 25000, failFirstCompletion: true });
  assert.equal((await s.webhook.POST({ text: async () => '{}', headers: new Headers() })).status, 200);
  await s.runAfterResponse();
  assert.equal(s.elapsed, 56900);
  assert.equal(s.status, 'backoff');
  assert.ok(s.elapsed < s.webhook.maxDuration * 1000);
});
