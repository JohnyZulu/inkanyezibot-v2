# Milestone 2 step 2a Task 07 review — 27 November 2026

**Verdict: ready to apply.** The two findings from the Codex review of PR #5 and a related budget-accounting defect are fixed in the attached patch. The patched files passed the step 2a and Milestone 1 suites on PostgreSQL 16.15.

## Branch, bytes and implementation

The checked-out base and the remote `milestone-2` tip both resolved to **`4e789bd5d74d1bf52583a201f280a2f76ab70ee7`**, the squash merge of PR #5. The prior Codex follow-up described commit `560be86`. It was unavailable in the local checkout and GitHub, so this bundle reconstructs the fixes from the two original review findings. The test results below come from fresh runs. The bundle was prepared locally without publishing a branch or updating the PR. [Merged PR #5](https://github.com/JohnyZulu/inkanyezibot-v2/pull/5) · [Prior follow-up](https://github.com/JohnyZulu/inkanyezibot-v2/pull/5#issuecomment-7205260488)

The patch and ZIP contain the complete review changes in `supabase/005_whatsapp_agent.sql`, `supabase/006_whatsapp_tests.sql`, `tests/whatsapp-postgres-2a.py`, `docs/milestone-2-plan.md` and this report. The standalone report is byte-identical to the copy under `docs/` in the ZIP. The downloadable `task-07-sha256.txt` lists every changed file, the ZIP and the patch.

## Findings and fixes

### P1 — Partial reply batch survived a failed completion

`commerce_wa_complete_turn` inserted each reply during validation. If a text reply came before a checkout link whose intent had closed, the function returned `checkout_not_open` normally and committed the earlier outbox row. The inbound stayed unanswered and the turn stayed running. Dispatch could send the stray reply, and recovery could answer the inbound again. [Original PR finding](https://github.com/JohnyZulu/inkanyezibot-v2/pull/5#discussion_r4714006923)

The function now validates and stages the whole batch, preserving each eligible reply's original position and deduplication key. It writes outbox rows only after the last reply passes validation, in the same transaction that answers the claimed inbound and releases the lease. **W33** failed on the merged SQL and passed on the revised SQL. It checks that rejecting a later reply leaves zero outbox rows, retains the lease and leaves the inbound unanswered. It then checks a corrected two-reply batch and confirms that replaying the committed turn adds no rows.

### P2 — Expired-turn recovery and late model settlement could deadlock

`commerce_wa_settle_model_spend` locked the reservation before updating the store/day budget. Expired-turn recovery acquired the budget lock before updating the reservation. A late settlement and a reclaim could each hold the row the other needed. [Original PR finding](https://github.com/JohnyZulu/inkanyezibot-v2/pull/5#discussion_r4714006936)

Recovery now locks every still-reserved row for the expired turn before touching any budget row. After waiting for a concurrent settlement, it counts only reservations that are still outstanding. **R9** holds the last reservation in that lock order, confirms the recovery session is waiting on PostgreSQL, and then settles the held reservation. PostgreSQL reported a deadlock on the merged SQL. On the revised SQL both sessions committed, the replacement turn reclaimed the original inbound, and a retry of settlement on a recovered reservation returned `replayed`.

### P2 — Recovery miscounted multiple reservations for the same day

The original recovery used `UPDATE … FROM` with one matching row per reservation. PostgreSQL updates a target budget row once even when several reservations match it. Recovery could mark all the reservations settled while moving only one amount from reserved to spent.

Recovery now sums the locked, outstanding amounts by store and budget day. It moves each total from reserved to spent before marking those reservations settled. **W24** now leaves two reservations on the same turn and checks both counters and both settlement records. **R9** also checks the exact combined spend after concurrent settlement, with the measured cost for the call that finished first and the reserved cost for the calls recovered after expiry.

## Tests rerun

| Check | Observed result |
|---|---|
| PostgreSQL engine | **16.15** (Debian package `16.15-1.pgdg12+2`) |
| WhatsApp built-in suite | **33/33 passed** with the revised `005` and `006`. After rollback there were zero test stores, orders and outbox rows in the unseeded scratch database. |
| WhatsApp race suite | **9/9 passed** with separate PostgreSQL connections. The original 8 races passed on the merged base. The new R9 failed on that base and passed five additional isolated runs on the revised SQL. |
| Milestone 1 built-in suite | **25/25 passed** with the revised `005` installed. |
| Milestone 1 PostgreSQL regression suite | **9/9 passed** with the revised `005` installed, including privilege, stock, reconciliation and lease checks. |
| Milestone 1 planner suite | **3/3 passed** with the revised `005` installed. Six overlapping planner calls returned three alerts-first and three payments-first. |
| Milestone 1 worker and webhook JavaScript suites | **12/12 passed** (7 worker + 5 review-04), using the existing fake RPC/provider harness. The timing sweep peaked at 43,500 ms of virtual time. |
| In-place update of the two functions | Passed on a scratch database with the base `005` already installed. An existing Milestone 1 order and a WhatsApp inbound row were preserved. Both SQL suites passed after the update (33/33 and 25/25). |

Commands for the revised files, using a disposable PostgreSQL 16 container named `task07-pg16`:

```sh
python3 tests/whatsapp-postgres-2a.py --container task07-pg16
node --experimental-vm-modules --test tests/commerce-worker.test.mjs tests/commerce-review04.test.mjs
```

The WhatsApp race harness also runs both SQL suites. The Milestone 1 PostgreSQL regression and planner suites used temporary copies of `tests/commerce-postgres-review.py` and `tests/commerce-worker-plan-review.py` with their setup extended to load the revised `005`. Their assertions ran as written in the repository.

## Application and verification scope

Apply the patch from a clean checkout of the base with `git apply --check task-07-4e789bd.patch` followed by `git apply task-07-4e789bd.patch`. The ZIP is the alternative if you prefer replacing complete files at their repository-relative locations.

For a fresh step 2a install, use the revised `005` and `006`. If the database has already run the base `005`, apply just the revised definitions of `public.commerce_wa_claim_turn` and `public.commerce_wa_complete_turn` with `CREATE OR REPLACE FUNCTION` in one transaction, then load the revised `006`. This is the in-place path tested above. The full `005` is an install script. If the old recovery code has already affected a budget counter, review its historical reservations before adjusting that counter.

**Outstanding verification:** Supabase SQL Editor and pg_cron, hosted dispatch, and Meta, Gemini and Paystack integrations. These results are from a disposable local database and the existing JavaScript harness.

## WhatsApp race results

| Test | Result |
|---|---|
| R1 Concurrent confirmation of one quote creates one order intent | Pass |
| R2 Cancellation wins before payment arrives | Pass |
| R3 Payment wins before replacement | Pass |
| R4 Concurrent repeated late payment creates one owner exception | Pass |
| R5 Six overlapping reservations obey the daily cap | Pass |
| R6 Overlapping turn claims obey the concurrency cap | Pass |
| R7 An expired lease cannot consume newer inbound | Pass |
| R8 Checkout replacement can overlap a paid-confirmation insert | Pass |
| R9 Late settlement and expired-turn recovery both commit with correct balances | Pass |

## WhatsApp built-in SQL rows

| Test | Result |
|---|---|
| W01 two senders sharing one receipt email see only their own orders | Pass |
| W02 paid confirmation is queued once, for the owning conversation only | Pass |
| W03 repeated payment event → no second paid confirmation | Pass |
| W04 owner_ref / sender / order owner / intent owner are immutable | Pass |
| W05 duplicate delivery stored once; late redelivery does not rewind the 24h window | Pass |
| W06 turn commits reply + answered together; newer inbound left for next turn | Pass |
| W07 retried commit of the same turn is a no-op (no duplicate reply) | Pass |
| W08 expired lease cannot commit, write, or consume newer inbound; next claim takes over | Pass |
| W09 quote needs a confirmed email; total is server-computed incl. courier | Pass |
| W10 wrong total, changed cart, superseded quote are all refused | Pass |
| W11 replayed "yes" returns the same checkout — never a second one | Pass |
| W12 retry recovers the SAME reference; ambiguous result must be reconciled before a new one | Pass |
| W13 checkout-link message is rendered from server records | Pass |
| W14 a second open checkout for one conversation is impossible (unique index) | Pass |
| W15 confirmed replacement cancels old checkout + releases holds in the same transaction | Pass |
| W16 paid-after-cancel → funds recorded, 1 owner exception, 0 pack tasks, 0 paid messages | Pass |
| W17 payment first → replacement refused (no cancel), stale yes cannot retry it | Pass |
| W18 replacement refused (stock) → old link still open, holds intact, nothing half-done | Pass |
| W19 paused: server turn; only confirm_quote / order_status / complete allowed | Pass |
| W20 paid during takeover → one fixed confirmation + owner alert; still paused | Pass |
| W21 owner resume → bot_active, handoff task resolved | Pass |
| W22 budget reserved before calls; cap hit → paused, 1 task, 1 resting notice | Pass |
| W23 owner takeover / pause mid-turn drops the AI reply | Pass |
| W24 all of an abandoned turn's reservations are counted as spent | Pass |
| W25 a message that fails 3 turns is closed as gave_up and handed to a person | Pass |
| W26 outside 24h → window_closed + owner task; inside → claimed for send | Pass |
| W27 send whose claim lapsed → uncertain; not reclaimed; late result refused | Pass |
| W28 explicit requeue → sent; status callbacks only move forward | Pass |
| W29 90-day purge removes text/payloads, keeps ids; replay still ignored | Pass |
| W30 owner-page checkout refuses WhatsApp orders (managed_by_whatsapp) | Pass |
| W31 every commerce_wa_* function: no public/anon execute, service_role yes | Pass |
| W32 quote for a checkout that has since closed → checkout_changed (re-quote) | Pass |
| W33 invalid later reply queues nothing; corrected batch commits once in order | Pass |

## Milestone 1 built-in SQL rows

| Test | Result |
|---|---|
| T01 server-side total = 2×1250 + 99 delivery | Pass |
| T02 order number INK-###### and email lower-cased | Pass |
| T03 same idempotency key → same order, no second hold | Pass |
| T04 customer-confirmed total differs → total_changed | Pass |
| T05 last unit: 2nd buyer gets insufficient_stock | Pass |
| T06 bad email / qty>10 / unknown sku refused | Pass |
| T07 attempt ref = order-1, double-click reuses it | Pass |
| T08 underpayment → mismatch_held + owner task, order stays unpaid | Pass |
| T09 verified payment → confirmed/ready_to_pack, allocated, task+job | Pass |
| T10 same payment applied twice → duplicate, nothing doubled | Pass |
| T11 late "failed" after success → no regression | Pass |
| T12 unknown reference → urgent owner task | Pass |
| T13 second real charge on paid order → duplicate_payment task | Pass |
| T14 handed_to_courier: on_hand 3→1 once; available stays 1 | Pass |
| T15 expired hold → stock available again, new checkout refused | Pass |
| T16 late payment, unit still free → confirmed + allocated | Pass |
| T17 late payment, stock gone → paid + on_hold + task, no oversell | Pass |
| T18 unpriced courier → delivery_not_priced + support task | Pass |
| T19 same provider event twice → stored once | Pass |
| T20 failed job → back to pending with backoff, error kept | Pass |
| T21 anon/authenticated cannot execute commerce_* functions | Pass |
| T22 reconcile rotation: one-per-run worker checks all 3 before repeating | Pass |
| T23 lease: in-flight attempt not re-claimable; wrong token refused; expiry frees it | Pass |
| T24 expired hold is revalidated, not blindly allocated | Pass |
| T25 worker plan: idle → none; both queues due → strict turn-taking | Pass |
