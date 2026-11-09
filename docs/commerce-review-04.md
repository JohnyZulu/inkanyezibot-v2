# Milestone 1 Task 04 verification — 9 November 2026

**Verdict: merge after fixes. PR #3 is not ready to merge.** The duration fix passes; a reconciliation liveness regression remains.

Applied option A from the uploaded `milestone-1-review03-files (1).zip` at `24b71a2`, overwriting exactly the six named paths. All six SHA-256 checksums matched Task 04 before committing and again after pushing. Implementation commit **`cc4aed530cef5e585910483bf060950bdac251fd`** has the requested message:

> Fix Codex review 03: budget whole worker units incl. DB calls; webhook alert via after()

Its tree `272c896f2d0de5d928085023874e8ee7fc9be4a6` matches the staged tree exactly. No SQL or dependencies changed. The supplied six files remain byte-for-byte unchanged; additional tests and this report are separate files/changes in a follow-up commit.

## Remaining finding

**Medium · `app/api/commerce/cron/route.js:44–47` and `lib/commerce/payments.js:55–60` · missed payments may never be reconciled under sustained slow DB responses.**

Reconciliation requires a full 40 seconds remaining. Every invocation first releases holds and probes the alert queue, even when that queue is empty. With each DB call taking six seconds, these consume 12 seconds of the 50-second work deadline. The remaining 38 seconds is insufficient, so no reference is claimed. The last empty outbox probe consumes another six seconds and the route returns `{ok:true}` after 18 seconds. This repeats on every invocation, leaving pending/unknown attempts unchecked until they age out of the 48-hour reconciliation window.

| Empty-alert run | Duration (virtual ms) | Payment claims / checks |
|---|---:|---:|
| 1 | 18,000 | 0 |
| 2 | 18,000 | 0 |
| 3 | 18,000 | 0 |
| 4 | 18,000 | 0 |
| 5 | 18,000 | 0 |

In general, with equal DB latency `d`, the empty-queue path can start reconciliation only if `2d + 40s <= 50s`, i.e. `d <= 5s`. Six seconds is comfortably inside the configured eight-second DB timeout, so these are successful bounded requests, not an outage or a timeout error. The same failure persists after initial due alerts have been processed and the due queue is empty. The finite-backlog test uses the supplied sandbox's backoff model; the zero-alert case is independent of delivery/backoff assumptions.

This **refutes** the Task 04 hypothesis that draining alerts ensures reconciliation runs. The 34-case supplied sweep always starts with ten alerts and asserts only combined alert-or-payment progress. It can pass while reconciliation makes no progress.

**Suggested fix:** schedule bounded reconciliation opportunities independently of preceding housekeeping/alert probes; guarantee turns for both queues across invocations rather than always spending part of the reconciliation allowance on an outbox probe first. Preserve the whole-unit deadline checks and token-owned claim/release behavior. Add an empty-outbox slow-DB liveness test to the acceptance criteria.

**Tests added:** two failing liveness tests in `tests/commerce-review04.test.mjs`. They reuse the supplied virtual worker environment (without editing its source file) and evaluate the actual production modules. No additional commerce runtime changes were made beyond the supplied six files.

## Duration and webhook verification

The supplied suite passes all **6/6** tests. The original 64.9s case now takes **29,000ms**. Hanging providers take **31,000ms**, alerts are attempted first, no job remains running, and one payment claim is released with its matching token. Across 34 combinations (RPC latency 0–8000ms in 500ms steps, verify timeout or success at 14.9s), the maximum duration is **43,500ms** at RPC=5500ms with verification timing out.

The webhook's new `after()` integration is appropriate for Next.js 15.3.6 on Vercel:

- [Next.js 15 `after` documentation](https://nextjs.org/docs/15/app/api-reference/functions/after) says callbacks execute after the response and run under the platform's default/configured route maximum duration.
- [Vercel function API documentation](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#usage-with-next.js) recommends `after()` for Next.js 15.1+, and explains that `waitUntil` promises share the function timeout and are cancelled if the function times out. This is not an extra 60 seconds after the response.
- The installed Next.js 15.3.6 `AfterContext` forwards callback work through `waitUntil` and starts the callback queue on response close. The build accepts the route's `after` import and `maxDuration` export.

Three additional mocked webhook lifecycle tests pass:

1. A 25s response phase returns 200 with no outbox claim yet. Draining the after callback then completes a worst-case alert at **49s total**.
2. If the callback starts one second later, or the pre-response phase takes 39s, the absolute `started + 50s` deadline prevents claiming the job; it stays pending for cron.
3. An alert succeeds just before its timeout, its first completion RPC fails, and the fallback completion RPC succeeds: **56.9s total**, still inside the 60s route limit. This error path uses part of the 10s headroom because the fallback RPC is beyond the nominal 25s step.

No tested normal/error sequence exceeded 60 seconds after the patch. Provider/RPC time is virtual, not a throughput benchmark. The webhook tests model `after()`'s documented lifecycle; they do not deploy to Vercel. Actual hosted behavior remains unverified until the account-level exit checks.

## Independently rerun checks on the pushed implementation

| Check | Result |
|---|---|
| Supplied worker JS suite | **6/6 pass** |
| New webhook lifecycle checks | **3/3 pass** |
| New reconciliation liveness checks | **0/2 pass** — reproduced starvation |
| PostgreSQL regression suite | **9/9 pass** on real PostgreSQL **16.15**, separate connections |
| Built-in SQL suite | **24/24 pass** |
| Stores/orders after built-in rollback | **0 / 0** |
| anon/authenticated public commerce EXECUTE | **0 / 0** |
| anon/authenticated commerce schema USAGE | **false / false** |
| APIs lacking security-definer/fixed-search-path settings | **0** |
| Build | **Pass**, types and all 13 static pages |
| All six SHA-256 checks | **Match before commit and after push** |

Build command: `GEMINI_API_KEY=test-placeholder npm run build`. Existing installed dependencies were reused, no package/dependency changes were made, and Next's automatic `tsconfig.json` rewrite was restored afterwards. The placeholder is a local test value only. The existing missing dependency lockfile and documented Next.js advisory remain separate concerns.

Commands from the repository root, using a disposable local PostgreSQL container named `commerce-review04-pg16`:

```sh
python tests/commerce-postgres-review.py --container commerce-review04-pg16
node --experimental-vm-modules --test tests/commerce-worker.test.mjs
node --experimental-vm-modules --test tests/commerce-review04.test.mjs
```

The last command intentionally exits nonzero for the two remaining liveness failures. Python uses its standard library; JS uses Node built-ins. No Supabase project, Paystack API, live key or real payment was used. Scratch databases and the test container are disposable.

## PR threads, risks and next bounded task

Stock allocation/expiry: **resolved**, with all prior concurrency regressions still green.

Reconciliation: **not resolved (reopened)** for the cron scheduling starvation above. The fair SQL claim ordering and token/lease ownership fixes remain valid; the cron currently never reaches them under the reproduced conditions.

Worker execution budget: **resolved for the reported duration defect**. Whole-unit guards fix the 64.9s regression; webhook alerts use the shared invocation budget after the response. Overall merge is still blocked on reconciliation liveness.

Real Supabase/PostgREST, pg_cron/Vault/pg_net, Paystack TEST round-trip/ZAR support and hosted Vercel `after()` remain **unverified**. Sanele must run the milestone exit checks. The broader stress harness was not independently rerun; its earlier reported result is not claimed as new verification.

Next bounded task: fix scheduling so an eligible payment is checked under sustained 6–8s DB latency even when the alert queue is empty or continuously populated, while retaining bounded invocations and alert progress. Then rerun the two supplied suites, the new liveness/webhook checks and the build before the real-account exit checks.

## Verified SHA-256 manifest

```text
a3e2c3ccb09778ca584724d10620b7941e06324b6881f15fb4017eac18ccc912  app/api/commerce/cron/route.js
f53361235bdd993eb75842d471b3761ebabd24e5761aef82fd30e64759e4d083  app/api/commerce/paystack/webhook/route.js
b47727980f1d74a3ba7710423795bfa74ad2aa9979003edc4ce28f77dc36ba13  docs/commerce-milestone-1.md
edc403539be18c565a03d13968878bac78720587e5688a94d3d3010142f6ba52  lib/commerce/jobs.js
55167d206e7abbe7c7d4e5f1382bd5436cd9fa89e0d05a16a728c09112318037  lib/commerce/payments.js
181aa5e84428b2e6ee7e00ed88d235a0e5fd85439a86c4c0011fc1ccef5c4152  tests/commerce-worker.test.mjs
```

## Built-in SQL rows

All 24 rows returned `passed = true`; no CRASH row.

| Test | passed |
|---|---|
| T01 server-side total = 2×1250 + 99 delivery | true |
| T02 order number INK-###### and email lower-cased | true |
| T03 same idempotency key → same order, no second hold | true |
| T04 customer-confirmed total differs → total_changed | true |
| T05 last unit: 2nd buyer gets insufficient_stock | true |
| T06 bad email / qty>10 / unknown sku refused | true |
| T07 attempt ref = order-1, double-click reuses it | true |
| T08 underpayment → mismatch_held + owner task, order stays unpaid | true |
| T09 verified payment → confirmed/ready_to_pack, allocated, task+job | true |
| T10 same payment applied twice → duplicate, nothing doubled | true |
| T11 late "failed" after success → no regression | true |
| T12 unknown reference → urgent owner task | true |
| T13 second real charge on paid order → duplicate_payment task | true |
| T14 handed_to_courier: on_hand 3→1 once; available stays 1 | true |
| T15 expired hold → stock available again, new checkout refused | true |
| T16 late payment, unit still free → confirmed + allocated | true |
| T17 late payment, stock gone → paid + on_hold + task, no oversell | true |
| T18 unpriced courier → delivery_not_priced + support task | true |
| T19 same provider event twice → stored once | true |
| T20 failed job → back to pending with backoff, error kept | true |
| T21 anon/authenticated cannot execute commerce_* functions | true |
| T22 reconcile rotation: one-per-run worker checks all 3 before repeating | true |
| T23 lease: in-flight attempt not re-claimable; wrong token refused; expiry frees it | true |
| T24 expired hold is revalidated, not blindly allocated | true |
