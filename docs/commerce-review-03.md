# Milestone 1 patch verification — 9 November 2026

Verdict: **merge after fixes**. Applied and pushed the supplied review-02 patch at `0807f86` as **`1202b5ece7931eaf5a0c43538892c142a7b52e22`**, with the requested message:

> Fix Codex review 02: leased one-at-a-time reconcile, deadlock-free expiry, canonical paths

The pasted diff arrived with CRLF line endings and its last blank context line/newline stripped. Restoring that blank context line from the base file and normalizing line endings made `git apply --index` apply cleanly; no patch code was changed. The pushed tree is `c0322a47c7064d3f061560958aa8eede83b8d9d1`, identical to the staged patch tree. The eight root duplicates are removed, reset is under `supabase/`, and active SQL/library/route paths now contain the fixes.

Documentation and additional tests are a separate follow-up commit; they do not change the supplied commerce implementation.

## Findings

**Medium — aggregate worker time still exceeds maxDuration with slow, successful DB requests.** `lib/commerce/payments.js:52–66` reserves 16 seconds for a reconciliation iteration, although it performs claim RPC → verify HTTP → apply RPC → release RPC. The new `lib/commerce/db.js:13` timeout permits each RPC to take almost eight seconds. `lib/commerce/jobs.js:40–54` similarly reserves nine seconds without claim/completion costs. The cron's 45-second work budget plus 15-second headroom does not cover every allowed sequence.

A deterministic test of the actual worker modules with mocked DB calls taking seven seconds each, hanging alert delivery, and a successful 14.9-second Paystack verify produces:

| Operation | End time (virtual seconds) |
|---|---:|
| Release expired reservations RPC | 7.0 |
| Claim one alert RPC | 14.0 |
| Alert HTTP timeout | 22.0 |
| Complete failed alert RPC | 29.0 |
| Claim reconcile attempt RPC | 36.0 |
| Successful Paystack verify | 50.9 |
| Apply verified payment RPC | 57.9 |
| Release reconcile lease RPC | **64.9** |

Every DB call finishes within its new eight-second timeout, but the handler overruns `maxDuration=60`. In production it can be terminated after applying the payment and before releasing the lease or returning a response. The lease still expires safely; this is worker completion/reliability, not a duplicate-stock finding.

**Suggested fix:** budget the full claim/verify/apply/release and claim/deliver/complete sequences, recheck remaining time after claims, and bound later RPCs by the remaining route deadline. Preserve time for completing claims/returning the response. Keep claiming only work that can be completed. The added `worker budget includes slow successful DB calls and successful verification` regression currently fails at **64,900ms**. No additional runtime changes were made beyond the attached patch.

## Previous findings and PR thread dispositions

| Area | Result | Evidence |
|---|---|---|
| Flattened upload / active paths | Resolved | Root duplicates removed; production imports and documented SQL paths carry replacements |
| Stock allocation race | Resolved | Real two-session S1/S2 pass; late payment held with urgent task when another buyer owns stock |
| Reconcile starvation | Resolved | One-at-a-time claim; eight one-check runs rotate through all three references |
| Overlapping reconciliation claims | Resolved | No repeat claim before commit or after commit while lease is live |
| Expiry/payment deadlock | Resolved | Original deterministic multi-item `test_30` passes unchanged |
| Worker duration | **Not resolved** | Original hanging-provider case passes; new slow-DB success case exceeds 60 seconds |

The stock and reconciliation PR threads can be resolved. The worker-budget thread stays open for the medium finding above.

## Focused lease and expiry checks

- Claim selection locks a candidate before stamping a new random token, excludes live leases, and orders by `last_checked_at NULLS FIRST, created_at, id`. A non-holder cannot overwrite a live claim through this API.
- Release compares both reference and token. Wrong token and NULL token return false. After forced lease expiry and takeover, the old token also returns false and leaves the new token untouched. The current token releases successfully. The 10s minimum, 300s maximum and 60s default lease durations were checked.
- Applying a successful payment during a live lease leaves both lease columns unchanged. The succeeded attempt is excluded from later claim selection; its owner can still release it. Reapplying is a duplicate; stock allocation, pack task and outbox job each remain one.
- Expiry uses ordered `FOR UPDATE SKIP LOCKED`. A locked expired row can remain `active` until another run, but `available_qty` ignores it by wall clock. A second buyer can reserve the freed stock immediately; the next run releases the old row once its lock is free.
- Hold-validity checks use `clock_timestamp()`, and hold creation now does too. Remaining `now()` calls timestamp events or measure attempt/job ages rather than hold validity. No further order/product/attempt lock cycle was identified in the changed functions.

## Tests executed on the pushed patch

Engine: **PostgreSQL 16.15**, separate psql connections, disposable Docker container without published ports. Supabase roles/default function grants simulated before schema loading. No real Supabase project, Paystack requests or live credentials were used.

| Check | Result |
|---|---|
| Supplied PostgreSQL regression file | **6/6 pass** |
| Built-in `commerce.run_core_tests()` | **24/24 pass** |
| Stores/orders after built-in rollback suite | **0 / 0** |
| anon/authenticated public commerce EXECUTE | **0 / 0** |
| anon/authenticated commerce schema USAGE | **false / false** |
| Public functions lacking definer/fixed search path | **0** |
| Supplied JS suite | **4/4 pass** |
| Hanging-provider virtual worker run | **39,000ms**, alerts first, zero running jobs, one claimed/one matching release |
| Expanded PostgreSQL file (three focused tests added) | **9/9 pass** |
| Expanded JS file (slow-DB-success regression added) | **4 pass / 1 fail**, failing case **64,900ms** |
| Old `0807f86` schema with one test order → reset | **0 commerce schemas / 0 public commerce functions** |
| Reinstall after reset | **24/24**, zero stores/orders |
| `GEMINI_API_KEY=test-placeholder npm run build` | **Pass**, including types and all 13 static pages |
| `npm ci` | Still unavailable: pre-existing missing package lock |

The earlier dependency installation was reused; no package declarations or dependencies were added. Next's automatic `tsconfig.json` rewrite was restored after build.

The supplied test edits preserve the original test intent: S1, S2 and deterministic deadlock test unchanged; rotation still checks three distinct references across eight one-check runs; overlap still checks before/after commit; the worker asserts no unnecessary claims and matching release tokens. Additional tests strengthen ownership and skipped-expiry behavior; existing assertions were not relaxed.

## Reproduction and remaining account checks

Start an empty local `postgres:16` container named `commerce-review03-pg16` (or use the `--container` argument for another disposable test container), then run from the repository root:

```sh
python tests/commerce-postgres-review.py --container commerce-review03-pg16
node --experimental-vm-modules --test tests/commerce-worker.test.mjs
```

The new JS budget test is intentionally failing until the remaining worker bug is fixed. JS provider/RPC timing is simulated; PostgreSQL concurrency tests use real connections. Test databases are dropped after the suite. Python uses only its standard library; JS uses only Node built-ins.

Real Supabase/PostgREST, pg_cron, Vault and pg_net integration; real Paystack TEST initialize/checkout/verify/webhook and account ZAR support remain **unverified**. Sanele must run the milestone exit checks. The reported S3/S4 and large stress run were not independently rerun. The known Next.js advisory and missing dependency lockfile remain separate existing concerns.

Next bounded task: account for all DB work in the worker's route deadline and make the slow-DB-success regression pass. Then run Sanele's real Supabase + Paystack TEST exit checks.

## Built-in SQL rows

All 24 rows returned `passed = true`; no CRASH row. Immediately afterwards, stores = 0 and orders = 0.

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
