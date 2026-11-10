# Milestone 1 follow-up review — 9 November 2026

Historical review: the implementation and test API described below were replaced by the Task 03 patch. See [review 03](commerce-review-03.md) for current results and commands.

Source reviewed: PR #3, `a5a3f7c903ce902098fffaead022863ddb5406b1`.
Verdict: **merge after fixes**. All three original threads remain **not resolved**.
Only documentation and regression tests were changed in this review. No commerce function semantics, dependency declarations, agent files or existing routes were changed.

## Findings and thread dispositions

1. **High — fix upload did not replace active files.** The fix commit adds eight root files; it changes none of the original runtime/SQL paths. `supabase/001_commerce_core.sql:607–614` still allocates live holds without product/reservation locks, uses transaction-start time for expiry, and can oversell. `supabase/001_commerce_core.sql:679–683` still selects newest-first. `app/api/commerce/cron/route.js:35–36` still runs 20 sequential verifies before ten alerts, using the old `lib/commerce/payments.js:47` / `jobs.js:37`. The active webhook still calls `processJobs(3)` (`app/api/commerce/paystack/webhook/route.js:34`). **Fix:** place root `001`/`002`/reset under `supabase/`, `payments.js`/`jobs.js` under `lib/commerce/`, `route.js` under the cron route, `route (1).js` under the webhook route, and the revised milestone guide under `docs/`; remove the root duplicates. Re-run verification against those actual paths. **Tests: yes** — S1/S2 and worker regressions fail on the active files and pass against the corresponding proposed replacements.

2. **Medium — reconciliation still starves with worker deferrals.** Root `001_commerce_core.sql:702–711` sorts candidates inside the subquery, but `UPDATE ... RETURNING` does not guarantee that order in its result. Root `payments.js:54–70` verifies the first returned rows until its deadline and resets untouched rows to `last_checked_at = null`. With three eligible attempts and budget for one failed verify, eight consecutive runs checked only `ROT-2`, indefinitely deferring the other two. Tests T22/T23 assume the whole selected batch was checked and miss this interaction. **Fix:** claim one attempt just before verifying it, or return claims explicitly ordered by their pre-claim scheduling values (with a deterministic tie-breaker), preserving fair order through deferral. **Test: yes** — `test_20_rotation_survives_worker_deferrals` fails on the proposed SQL.

3. **Medium — SKIP LOCKED is not an external-work lease.** Root `001_commerce_core.sql:699–719` only retains row locks for the database call. After that call commits, a second cron invocation can claim the same pending attempt while the first invocation is still waiting on Paystack, even with no other eligible attempts. The first worker's unclaim is also not tied to a claim owner/version. Payment application remains idempotent; this duplicates provider work and undermines the scheduling guarantee rather than allocating stock twice. **Fix:** add a bounded claim lease/token, exclude in-flight leases and require token ownership when releasing a claim. Do not hold a SQL transaction open across external HTTP work. **Test: yes** — `test_21_overlapping_workers_cannot_claim_in_flight_verification` demonstrates skip-locked exclusion before commit and duplicate claim after commit.

4. **Medium — multi-item expiry/payment reservation deadlock.** Root `001_commerce_core.sql:619` locks an order's reservations by UUID. The expiry worker at `:688–689` updates expired rows in scan order. For an order with two expired reservations physically inserted high UUID then low UUID, expiry locks the high row while payment locks the low row; each then waits on the other. A deterministic two-session test produces `deadlock detected` in `commerce_apply_verified_payment`, rolling its entire payment application back. This requires retry; it did not oversell. **Fix:** have expiry take reservation locks in the same deterministic order (or use an ordered `FOR UPDATE SKIP LOCKED` batch and update only its locked IDs). Preserve product-before-reservation ordering wherever both are needed. **Test: yes** — `test_30_expiry_and_multiline_payment_have_consistent_reservation_lock_order` fails on the proposed SQL. A test-only BEFORE UPDATE trigger pauses expiry after its first row lock to control scheduling; no production function is replaced.

Stock thread: **not resolved** — original implementation is still active. The proposed SQL passes S1/S2, but expiry/payment can deadlock on multiple reservation rows.

Reconciliation thread: **not resolved** — old newest-first selection is still active; proposed SQL also has findings 2 and 3.

Worker-budget thread: **not resolved** — the active worker still takes 380s of virtual provider time. The intended replacement passes the hanging-provider case at 39s, but is not imported by the route.

## Lock/clock audit

For the proposed root SQL: payment locks attempt → order → products (ID order) → reservations (ID order). Fulfilment locks order → products (ID order) → allocated reservations; product locks serialize shared SKUs before the reservation stage. Order creation locks products (ID order) then upserts the customer and inserts its new order/reservations. Starting checkout locks the order and inserts a new attempt, but does not take a conflicting lock on an existing attempt. Other attempt mutations lock attempts only; outbox operations lock jobs only. No additional product/order/attempt lock cycle was identified in those functions. Expiry's unordered multi-reservation locking is the reproduced remaining cycle above.

The proposed hold-validity comparisons in availability, checkout eligibility, payment validation/update and expiry release all use `clock_timestamp()`. Canonical `supabase/001` still uses `now()` for those comparisons. The proposed `now()` at `:386` creates a hold deadline from transaction start; it is not a validity comparison, but a long lock wait can shorten the effective hold duration. Other retained uses timestamp events or age attempts/jobs.

## Independently executed checks

Engine: **PostgreSQL 16.15**, official `postgres:16` image, digest `sha256:f9a7b9ebf6f56201f949db745e47bc423c0f0f8294bafe991cc10bf74b029657`.
Roles `anon`, `authenticated`, `service_role` and public default function EXECUTE grants were created before loading each schema, matching the requested Supabase privilege simulation.

| Check | Canonical paths (active) | Proposed root replacements |
|---|---|---|
| Built-in SQL suite | 21/21 pass | 24/24 pass |
| Stores/orders immediately after suite | 0 / 0 | 0 / 0 |
| anon/authenticated public commerce EXECUTE | 0 / 0 | 0 / 0 |
| anon/authenticated commerce schema USAGE | false / false | false / false |
| Public functions lacking definer/fixed search path | 0 | 0 |
| S1 payment uncommitted across expiry, competing buyer | oversold: 2 committed units / 1 on_hand | buyer waits, then insufficient_stock |
| S2 payment transaction starts before expiry, buyer commits after | oversold: 2 committed units / 1 on_hand | payment applied on_hold; urgent stock task; 1 / 1 |
| New PG regression suite (6 tests, includes core suite) | 2 pass, 3 fail, 1 error (missing unclaim function) | 3 pass, 3 fail (rotation, lease, deadlock) |
| JS suite (4 tests) | 1 pass, 3 fail | 4 pass |
| Hanging providers in real worker modules, fake RPC and virtual clock | 380,000ms; reconciliation before alerts | 39,000ms; alerts first; 0 running; 9 deferred |

The fake-clock test evaluates the actual route, payments, jobs and Paystack source using Node VM modules with injected dependencies. It does not measure wall-clock throughput or real database/network latency. The claim/deferral regression executes the real PostgreSQL functions and mirrors the worker's one-verify/defer-rest budget boundary. PostgreSQL tests use separate psql processes/connections and unique disposable databases, dropped after the run.

`npm ci` **fails** because no package lock is committed (pre-existing repository state). Existing declared dependencies were installed with `npm install --package-lock=false`; **no dependencies were added**. Then `GEMINI_API_KEY=test-placeholder npm run build` **passed**, including type checking and generation of all 13 static pages. Auth.js/Jose emitted Edge-runtime CompressionStream/DecompressionStream warnings. The placeholder was local test input only. Next's automatic `tsconfig.json` rewrite was reverted after the build.

Signature test: correct HMAC-SHA512 over the raw body accepted; wrong length, wrong value and modified raw body rejected.

## Reproduction

Start a local disposable test container (no published port, no remote database):

```sh
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  docker --host=unix:///var/run/docker.sock run -d --name commerce-review-pg16 \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
```

Wait for `docker exec commerce-review-pg16 pg_isready`, then from the repository root:

```sh
python tests/commerce-postgres-review.py
python tests/commerce-postgres-review.py --uploaded
node --experimental-vm-modules --test tests/commerce-worker.test.mjs
COMMERCE_REVIEW_UPLOADED=1 node --experimental-vm-modules --test tests/commerce-worker.test.mjs
```

These are regression tests: failures above are intentional evidence of unresolved bugs; they should turn green after fixes. The root-file switches are temporary review aids and should be removed when the replacements are installed in their canonical locations. Python uses only its standard library; JS uses only Node built-ins. Stop/remove the test container when done.

## Outstanding risks and next bounded task

Real Supabase/PostgREST, pg_cron, Vault and pg_net integration; real Paystack TEST initialize/checkout/verify/webhook flow and account ZAR support remain **unverified**. Sanele must run the milestone exit checks. v0.3 architecture sections were not supplied in this checkout, so conformance to those additional sections was not independently assessed. The reported S3, ten-buyer race and 49k-operation stress run were not independently rerun. Local S1/S2 results do not establish broader production concurrency behavior. Work budgets assume bounded DB calls; the unchanged Supabase RPC adapter has no application deadline. The known Next.js advisory remains a separate documented go-live blocker.

Next task: correct the uploaded file paths, give reconciliation a fair single-attempt claim with an expiring ownership lease, and order expiry's reservation locks. Re-run both regression suites against canonical paths; then Sanele runs the real Supabase + Paystack TEST exit checks.

## Built-in SQL test rows

Canonical SQL returned T01–T21 below, all true. Proposed SQL returned all 24 rows below, all true. Both suites left zero stores and orders immediately after execution.

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
| T22 reconcile rotation: 2nd batch starts with the never-checked attempt | true |
| T23 unclaimed attempt is first in the next batch | true |
| T24 expired hold is revalidated, not blindly allocated | true |
