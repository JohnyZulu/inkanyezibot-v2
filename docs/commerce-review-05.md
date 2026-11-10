# Milestone 1 Task 05 verification — 10 November 2026

**Verdict: ready to merge. PR #3 is ready to merge for the Milestone 1 code review.** No new blocking findings were found. Real-account exit checks remain unverified, as detailed below; this is not a production verification claim.

## Branch, bytes and implementation

Before applying anything, both the GitHub PR metadata and fetched `origin/milestone-1` identified **`00c792456d279614f15bd4bd61a00d7e0735850a`**. The local branch matched and the working tree was clean. A second remote check before committing still identified the same base. No intervening external push was observed.

Used option A, the uploaded `milestone-1-review04-files.zip`, to overwrite exactly the six expected paths. Every SHA-256 matched Task 05 before committing and again after pushing. The six supplied files are not modified by the documentation/test follow-up.

Pushed implementation commit **`cb296c973ea6e5c674571d7ccb02d0b447db0764`** with the requested message:

> Fix Codex review 04: strict worker turn-taking, oldest-due alerts, no release probe

The pushed tree `0b0f86159e593bf5c44254297fa0c6be671f4e5b` matches the staged tree. The ref update used an expected-head check against `00c7924`, without forcing the branch.

## Requested checks and findings

**No remaining blocking finding in the reviewed change.**

1. **Reconciliation gets its turn.** The cron makes one bounded planner call, skips queues with no due work, and serves one unit of the selected first queue before spending time elsewhere. Under the modeled eight-second DB limit, planner + payment unit is at most `8s + 40s = 48s`, inside the 50s work deadline. Planner + alert unit is at most `8s + 25s = 33s`. It then reserves the other queue's whole-step allowance before further work. Both queues having work causes strict first-queue alternation across invocations, rather than relying on an alerts-first phase eventually leaving enough time. Existing empty-alert and processed-alert liveness regressions pass unchanged.
2. **The state flip is atomic under overlap.** The planner updates the singleton `commerce.worker_state` row using its current `last_first` value and returns the updated choice. A real PostgreSQL test holds this row locked, starts six separate sessions, confirms all six are blocked on their planner updates, then releases the gate. The results are exactly **three alerts-first and three payments-first**, with both due flags true. No external HTTP work is held inside this transaction.
3. **Oldest-due claiming beats a lower-ID retry.** A real PostgreSQL test inserts a recent due low-ID job before a higher-ID job due ten minutes ago. `commerce_claim_jobs(1)` claims the older higher-ID job first and the recent lower-ID job second. This tests the actual worker's one-job claim size.
4. **Removing the worker's release probe does not reserve expired units.** Availability, checkout eligibility and payment revalidation still judge holds by wall clock. The real PostgreSQL skipped-hold test leaves an expired reservation `active` and locked: availability frees its unit, another buyer succeeds, and the next release run clears the row after unlocking. S1/S2 and the deterministic multi-item expiry/payment test remain green. `004_schedules.sql` Part A still schedules database cleanup every minute. Configuring that job in real Supabase is part of the outstanding exit checks.
5. **Privilege/lease boundaries remain intact.** Public commerce functions, including the new planner, are security definers with fixed search paths and unavailable to anon/authenticated roles; the private commerce schema remains inaccessible to those roles. Lease ownership, stale-token rejection and idempotent payment-during-lease checks pass.

## Tests rerun on the pushed implementation

| Check | Result |
|---|---|
| `tests/commerce-worker.test.mjs` | **7/7 pass** |
| `tests/commerce-review04.test.mjs` | **5/5 pass**, including both formerly failing liveness checks |
| Combined JS suites | **12/12 pass** |
| Busy-shop fairness sweep | **18 combinations × 8 runs**; both queues served in every adjacent two-run window, all 3 recurring attempts checked, each invocation below 60s, matching release tokens |
| Existing duration sweep | **34 combinations pass**, maximum **43,500ms** virtual time |
| Hanging-provider run | **31,000ms**, alerts first, no running job left, one claim/one matching release |
| Original slow-DB success regression | **29,000ms** |
| Empty-alert queue, six-second RPCs | First three runs each verify one reference (**38,900ms**); all 3 checked, then idle |
| Initial due alerts then empty queue, six-second RPCs | Both queues progress; all 3 payment references checked |
| `tests/commerce-postgres-review.py` | **9/9 pass** on real **PostgreSQL 16.15**, separate sessions |
| Built-in `commerce.run_core_tests()` | **25/25 pass**, zero stores/orders after rollback |
| anon/authenticated public commerce EXECUTE | **0 / 0** |
| anon/authenticated commerce schema USAGE | **false / false** |
| API functions missing definer/fixed-search-path settings | **0** |
| Additional `tests/commerce-worker-plan-review.py` | **3/3 pass**: idle/single-queue cases, six concurrent planners, oldest-due job ordering |
| Prior `00c7924` schema + one test order → reset | **0 commerce schemas / 0 public commerce functions** |
| Reinstall following reset | **25/25**, zero stores/orders |
| Build | **Pass**, type checking and all 13 static pages |
| Six SHA-256 values | **All match before commit and after push** |

Build command: `GEMINI_API_KEY=test-placeholder npm run build`. Existing installed dependencies were reused. No dependencies were added or changed. Next's automatic `tsconfig.json` rewrite was restored after the build. The placeholder is a local test value only.

The new planner tests use Python's standard library and the existing psql/Docker harness. The six-session planner check uses a test-only locking session, not a replacement production function. The JS suites evaluate actual production modules with fake provider/RPC timing; those durations are virtual, not a throughput benchmark. PostgreSQL concurrency is real. The broader S3/S4/stress harness results supplied by Claude were not independently rerun and are not claimed as new evidence here.

Commands from the repository root, with a disposable local PostgreSQL container named `commerce-review05-pg16`:

```sh
python tests/commerce-postgres-review.py --container commerce-review05-pg16
python tests/commerce-worker-plan-review.py --container commerce-review05-pg16
node --experimental-vm-modules --test tests/commerce-worker.test.mjs tests/commerce-review04.test.mjs
GEMINI_API_KEY=test-placeholder npm run build
```

## PR threads, risks and next bounded task

All three original review threads are resolved after this verification: stock allocation/expiry, reconciliation fairness/leases, and worker execution duration. No merge was performed.

Still **unverified**: a real Supabase project and PostgREST/role setup, pg_cron/Vault/pg_net integration and actual schedule execution; real Paystack TEST initialize → checkout → verify/webhook and account ZAR availability; hosted Vercel `after()` behavior. The prior webhook lifecycle tests remain green, but no hosted deployment or real provider round-trip was performed. No live key or real payment was used.

The pre-existing missing dependency lockfile and documented Next.js 15.3.6 advisory remain separate reproducibility/go-live concerns. This review does not mark them fixed or authorize live payments.

**Next bounded task:** merge PR #3, then Sanele runs the documented Supabase + Paystack TEST exit checks before starting the next milestone. A merge is the owner's next action; it was not part of this apply-and-verify request.

## Verified SHA-256 manifest

```text
ab5351daffdc059a73c16f492dd6c8ecc7fd637b9550419e1975d85566f78937  app/api/commerce/cron/route.js
73d2cf83cec3f9eeca0f43f07a4943dc005698ec59c50bf3c5f018b2d7bddf70  docs/commerce-milestone-1.md
06d08f4f3cb59a5e3a842e08ec734a538bbf4d685fc097fc397379234ed94a18  supabase/001_commerce_core.sql
afe0c7f6bef2f3af8e6d7dd1a4a600faa5cbbca54af7e04736fe7656b0701a15  supabase/002_commerce_tests.sql
d9de13fcaaacd6d4bf4ce6036ee166bf2a65fe09c2156f7f194b57f49ded2d0b  tests/commerce-postgres-review.py
7bbfa9cab58cc792ac8a4ccd93004d258e4cba3f7a43883ae16041c33403505c  tests/commerce-worker.test.mjs
```

## Built-in SQL rows

Every row below returned `passed = true`; no CRASH row.

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
| T25 worker plan: idle → none; both queues due → strict turn-taking | true |
