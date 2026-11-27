# Milestone 2 — WhatsApp customer agent (design v2)

**Status:** v2 — owner decisions (Codex Task 06) folded in; Codex Task 06 technical findings resolved in the step 2a database contracts (`supabase/005_whatsapp_agent.sql`). · **Author:** Claude · **Owner:** Sanele
**Builds on:** Milestone 1 (`master` @ `8778d82`) · **Architecture:** v0.3 §5, §12–§16, Phase 3

> **Operating principle (v0.3):** *The AI converses; the database transacts.* The model reads messages and calls narrow tools. Prices, totals, stock, payments, order states, checkout links and paid confirmations come from database functions and records. A customer message can never mark an order paid, change a price, see another customer's order, or reach owner tools.

---

## 1. Goal and exit criteria

**Goal:** a customer chats to Izulu & Co on WhatsApp, finds a watch (with a photo), builds a basket, confirms the exact total, gets a Paystack **test** checkout link, pays, and is told in the chat that the order is confirmed. If they ask for a person, a human takes over.

**Exit criteria (v0.3 Phase 3):**
1. A real WhatsApp conversation on Meta's test number completes a paid (test-mode) order end to end.
2. Automated tests prove the customer agent **cannot** reach owner tools or another customer's orders — including a customer who uses the **same receipt email** as someone else.
3. Every price/total the agent states comes from a tool result in the same turn (deterministic check, §8). Checkout links, order status and paid confirmations are rendered from server records, not by the model.
4. A "talk to a person" request stops the bot until the owner resumes it.
5. Duplicate / out-of-order / replayed WhatsApp deliveries never produce duplicate replies, orders or checkouts.

## 2. Owner decisions (Task 06, 23–24 Nov 2026)

| # | Decision |
|---|---|
| D-M2-1 Email | Ask once before the first payment link; format-check and **read back**; save on the WhatsApp identity; customer can change it. No OTP in M2. No placeholder email. |
| Linking old orders | **Not in M2.** A customer sees only orders created from **their own WhatsApp number on this business number**. Anything else → `request_human`. |
| Basket edited while a link is unpaid | **Ask, then replace.** "You have an unpaid link for R X. Cancel it and make a new one for R Y?" One open checkout per conversation. Paid-after-cancel → money recorded, nothing auto-fulfilled, owner exception task. |
| Handoff | Owned by Sanele via the owner page (2e). No promised hours: "A member of the Izulu & Co team will reply here as soon as possible." Bot paused until resumed. |
| Paid during takeover | Fixed confirmation sent **automatically** (from the payment record), owner alerted, bot stays paused. |
| Retention | Message text + media **90 days**. Order/payment records **5 years**. |
| Model budget | **US$2/day** (Gemini paid tier). When reached: scripted "resting" reply, auto-handoff, owner alert. Checkout links, paid confirmations and order status keep working (no model). Daily reset: **midnight Africa/Johannesburg** (Codex's proposal, adopted as the default; it is a setting — `wa_settings.budget_timezone`). |
| Persona | **"Izulu Concierge"**, "Sawubona!" opener, then English. |
| Catalogue | Watches only for the pilot (Heritage + Hybrid). |
| Channel | Official WhatsApp Cloud API, direct (no BSP). |

## 3. Message flow

```
Customer ─► Meta ─► POST /api/whatsapp/webhook                                  (2b)
   1. verify X-Hub-Signature-256 (HMAC-SHA256, app secret, RAW body, constant time) → 401 if bad
   2. commerce_wa_record_inbound(...) per message — ONE transaction:
        identity + conversation upsert, message stored once (unique business number + WA id),
        24h window anchor updated. The unanswered row IS the schedule.
   3. answer 200 (target < 2 s)
   4. after(): try to claim + run a turn for that conversation (best effort)

WhatsApp worker  (own route + own pg_cron schedule — NOT the Milestone 1 commerce worker)   (2b/2c)
   loop while budget allows:
     commerce_wa_claim_turn() → {turn_id, lease_token, kind: agent|server, message_ids}
     agent turn : model tool loop; every tool call passes (turn_id, lease_token)
     server turn: model-free allow-list only (§6)
     commerce_wa_complete_turn(turn_id, lease_token, replies)  ← reply intent + "answered" + lease release, one transaction
   commerce_wa_claim_outbound() → send → commerce_wa_outbound_result()            (2b)

Payment applied (M1 webhook / reconciler) ─► trigger inside THAT transaction:
   intent → paid, ONE paid_confirmation outbox row per order (dedup 'paid:<order>'), owner task if paused.
Status callbacks (sent/delivered/read/failed) → commerce_wa_outbound_status() — never create a reply.
```

## 4. Identity and order ownership  *(Codex Task 06 finding 1 — Critical)*

- **Problem:** Milestone 1 identifies customers by `(store, email)`. Two WhatsApp senders can type the same receipt email, so email can't be the ownership key.
- **Resolution:** `wa_identities` has one row per **(receiving business number, verified sender `wa_id`)** with an immutable `owner_ref` (trigger refuses changes to `owner_ref`, `store_id`, `channel_id`, `wa_id`). Every WhatsApp order gets an immutable `wa_order_owners` row (`order_id → owner_ref`; updates and deletes refused). `commerce_wa_customer_orders` and paid notifications go through `owner_ref` only; the M1 `customers` row is shared by email and is never used for lookup. A number that isn't yours gets the same answer as one that doesn't exist (no oracle).
- **Email:** `set_contact_email` stores a pending email; `confirm_contact_email` (exact read-back match) saves it as `confirmed_email` on the identity. Each quote **snapshots** that email, and the checkout intent freezes it (immutable). Changing the email later never alters an existing checkout. The WhatsApp path passes **only** the email to `commerce_create_order` (no phone), so one sender can't overwrite another's details on the shared customer row.
- `wa_id` comes only from the signature-verified webhook. No tool accepts a customer id, phone or email from the model except `set_contact_email`'s value, which is format-checked and read back.

## 5. Checkout: quotes, intents, replacement  *(findings 2 + 3 — Critical)*

### 5.1 Quote → confirm
`commerce_wa_create_quote` freezes: cart id + **revision**, priced items, delivery, totals (server-computed), email snapshot, and **which open checkout it replaces** (`replaces_intent_id` + its total) — or none. Creating a quote supersedes older offered quotes. Quotes expire (default 15 min).

`commerce_wa_confirm_quote(turn, lease, quote_id, confirmed_total)` binds the customer's "yes" to **both** the old checkout and the exact replacement:

| Check | Refusal |
|---|---|
| quote already accepted | **replay** → same intent returned, nothing new created |
| quote superseded / stale / failed / refused | `quote_not_current` |
| expired | `quote_expired` |
| confirmed total ≠ quote total | `total_mismatch` |
| cart revision moved on | `cart_changed` |
| the open checkout is no longer the one the quote named | `checkout_changed` (re-quote) |
| the replaced checkout was paid | `old_checkout_paid` |

### 5.2 One intent, persisted reference, before the provider call
On acceptance, one transaction creates: the order (`commerce_create_order`, idempotency key `wa:quote:<id>`, expected total = quote total), the `wa_order_owners` row, **payment attempt #1 with its reference**, and the `wa_checkout_intents` row (`awaiting_url`). Paystack hasn't been called yet. **A unique partial index allows at most one intent per conversation in `awaiting_url | open | uncertain`** — so "one open checkout" includes checkouts still waiting for their URL.

URL lifecycle (app code calls Paystack in 2b/2c; these are the DB contracts):

```
awaiting_url ──claim_init──► caller initializes with the PERSISTED reference
     │  ├─ URL returned ─────────────────────► attach ──► open ──► (claim_init again → 'send_url': same URL, never a new one)
     │  ├─ definite refusal (4xx) → init_result('not_created') → awaiting_url (same reference may be retried)
     │  └─ timeout / 5xx / "duplicate reference" → init_result('uncertain') → uncertain
uncertain ──claim_init──► 'reconcile' (verify by reference FIRST)
     ├─ not found at Paystack → resolve(false) → awaiting_url, SAME reference
     ├─ found, not paid       → resolve(true, status) → old attempt retired (reference kept for late matching), attempt n+1
     └─ found, success        → refused: apply the payment first (M1 path); trigger marks the intent paid
hold expires before any URL was sent → claim_init returns 'expired' → checkout closed (customer re-confirms)
```
A parallel retry while a claim is live gets `wait`. A URL that arrives for an intent closed meanwhile is stored for audit but `attach` returns `intent_closed`, so it is never sent. The Milestone 1 owner-page path (`commerce_start_payment_attempt`) now refuses WhatsApp orders (`managed_by_whatsapp`), so nobody can mint an untracked second link.

### 5.3 Replacement vs. a concurrent payment
`confirm_quote` takes the **same locks in the same order as `commerce_apply_verified_payment`**: payment attempt(s) → order → intent; then products (id order) → reservations, as everywhere in M1. Exactly one side wins:

| Who commits first | Result |
|---|---|
| **Payment** | Order is `confirmed` → replacement refused (`old_checkout_paid`), quote `refused_paid`. One paid confirmation. Customer sees: "Your earlier payment of R X just came through — order INK-… is confirmed. Your basket changes weren't applied; want a new order for the extra items?" |
| **Cancellation** | In the same transaction: holds released, pending attempts `cancelled` (**references kept**), order `cancelled`, old intent `cancelled`, new order + intent created. A later payment on the old reference is recorded by M1 as `paid_after_cancel`: money on the attempt, **one** owner exception task (`paidcancel:<attempt>`), **no** pack task, **no** owner paid-order job, **no** customer paid confirmation; intent marked `paid_after_cancel`. Owner decides honour/refund. |

**Replacement that can't be created** (stock gone, price changed, delivery unpriced): the whole replacement runs inside a savepoint and is rolled back. The old link **stays open**, its holds intact; the quote is marked `failed` with the reason. Customer sees: "I couldn't make the new link — only 1 W-LAST is left (or: the price changed to R…). Your earlier link for R X is still open; would you like to pay that, or change the basket?"

Lock-order note: the conversation row is locked `FOR NO KEY UPDATE`, which is compatible with the `KEY SHARE` lock that the paid-confirmation insert (FK to the conversation) takes inside the payment transaction. With `FOR UPDATE` that pairing deadlocks — race test R8 reproduces it.

After payment, the cart that produced the paid quote is closed if it hasn't changed since the quote; if it has (payment won a race), it stays active and the bot re-shows it before any new checkout.

## 6. Turns, leases and paused conversations  *(findings 4 + 5 — High)*

- **Dedup + schedule together:** `commerce_wa_record_inbound` stores the message and updates the conversation in one transaction; there is no separate job to lose. Replays/duplicates change nothing; a late redelivery never rewinds the 24h window, a future timestamp never extends it.
- **Explicit claims:** `commerce_wa_claim_turn` records the exact inbound ids it owns (≤ 20, oldest first) and a lease token. `complete_turn` marks **only those ids** answered — messages that arrive during the turn wait for the next one.
- **Fencing:** every tool function takes `(turn_id, lease_token)` and checks the token, the turn is current, and the lease hasn't expired (real clock). An expired turn can't write, reply or consume inbound; the next claim marks it `abandoned` and re-claims its messages. `complete_turn` retried after an ambiguous DB timeout is a no-op (`replayed`).
- **Atomic reply batches:** `complete_turn` stages all eligible replies before queuing any of them. If any reply fails validation, the inbound messages stay unanswered and the worker can correct the batch or release the turn.
- **Bounded concurrency:** at most `p_max_concurrent` (default 3) live leases; claims are serialised by an advisory lock so the count is exact.
- **Poison messages:** after 3 failed turns a message is closed as `gave_up` and the conversation goes to a human.
- **Paused (`human_requested | human_active`) — enumerated server-handled actions.** Claims become `kind='server'` (model-free). Allowed: `confirm_quote` (customer taps the "Yes, pay R…" button of a quote shown before the pause → link sent from the fixed `checkout_link` template), `order_status` (own orders, fixed template), `complete`. Everything else (cart, quote, email, model reservation, free-form replies, request_human) returns `action_not_allowed`. Other inbound is stored, `owner_unread_since` set, no reply. If the owner takes over **mid-turn**, the AI's free-form reply is dropped at commit (`paused_discarded`).
- **Paid confirmation during takeover:** written by the payment transaction itself (not a turn), deduplicated per order, owner task `wa_paid_during_takeover`, conversation stays paused.
- **Rendering from server records:** `complete_turn` builds `checkout_link` (URL, total, order number, hold expiry) and `order_status` payloads from the database; callers pass only an intent id / order numbers. Paid confirmation payload comes from the order row. Free-form `reply` text is the only model-written content and still goes through the grounding check (§8, 2c).

## 7. Model budget  *(finding 5)*
`commerce_wa_reserve_model_spend(turn, lease, estimate)` **before** every model call: a single `UPDATE … WHERE reserved + spent + estimate <= cap` on the store/day row, so concurrent reservations stay within the cap (race test R5: 6 concurrent × US$0.90 against US$2.00 → exactly 2 succeed). Settlement records the actual cost, including overruns. Recovery of an expired turn locks all outstanding reservations before updating the budgets, then counts their full amounts as spent per store and day. A settlement that finishes first keeps its actual cost. On exhaustion: conversation → `human_requested` (reason `budget`), one owner task per day, one scripted "resting" notice per conversation per day. Units: micro-USD. Day: local date in `Africa/Johannesburg`.

## 8. Guardrails (agent, 2c)
- Bounded loop: `MAX_STEPS` 6; per-model-call timeout; whole-turn budget (§10). On limit → polite fallback + owner task; never a half-made checkout (the DB makes that impossible anyway).
- Grounding check before sending a free-form reply: every money amount must equal an amount returned by a tool in this turn; order numbers and "paid/confirmed" claims must come from `get_order_status` / payment state. Mismatch → regenerate once → else safe fallback + owner task.
- Prompt rules: never invent products, prices, stock, discounts, delivery dates or payment status; checkout only after the customer confirms the exact quote; never ask for card details; offer a human when unsure.
- Rate limits per identity (2c). Logs: tool name, duration, outcome, correlation id, cost — never bodies, phone numbers or emails. `request_human` takes a **category code** (`asked_for_person | complaint | cannot_help | payment_problem | other`), never free text, so owner-task context never holds message content.

## 9. Outbound and the 24-hour window  *(finding 5)*
- `commerce_wa_claim_outbound`: one message in flight per conversation, oldest first (keeps order).
- **24-hour rule applied at dispatch:** any queued row whose conversation's last inbound is > 24 h old becomes `window_closed` + one owner task per conversation (`high` for paid confirmations). No approved templates in M2 — adding them is an explicit later scope change.
- **Uncertain sends:** a send that times out (`outbound_result('uncertain')`) or whose claim lapses becomes `uncertain`, opens an owner task, and is **never auto-resent**. WhatsApp's send API has no idempotency key and no lookup by our id, so only an explicit `commerce_wa_outbound_resolve(id, 'requeue'|'cancel')` moves it on. (2b may add an automatic policy for low-risk `reply` rows after review; never for checkout links or paid confirmations.)
- Status callbacks only move forward (`sent → delivered → read`, `failed`), matched by provider message id.

## 10. Reliability and time budgets
- Webhook: signature + `record_inbound` RPC(s) → 200, target < 2 s.
- **WhatsApp work runs on its own route and its own pg_cron schedule**, never inside the Milestone 1 commerce worker (Codex: an 8 s planner + 45 s turn would exceed the 50 s commerce work budget, and payments must keep their guaranteed turn).
- Turn budget (2c, `maxDuration = 60`): **40 s total**, whole-unit rule as in M1 — a step starts only if its worst case fits: claim RPC 8 s → model calls ≤ 10 s each, each preceded by a reserve RPC → tool RPCs 8 s each → commit RPC 8 s. Lease 60 s > budget + commit, so a live turn never loses its lease mid-step; a crashed one is taken over after 60 s.
- A failed WhatsApp send never undoes an order or payment.

## 11. Retention  *(finding 6 — High)*
| Data | Where we store a copy | Kept | How |
|---|---|---|---|
| Message text, media ids | `wa_inbound.body`, `media_id` | **90 days** from receipt | daily `commerce_wa_purge_expired()` (pg_cron `commerce-wa-retention`, 02:15 SAST) sets them NULL + `redacted_at` |
| Outbound text, links | `wa_outbox.payload` | 90 days from creation (after sending finishes) | same job |
| Delivery address, email snapshot on quotes | `wa_checkout_quotes.delivery`, `email_snapshot` | 90 days | same job (the order keeps its own frozen copy, 5 years) |
| Cart address | `wa_carts.delivery` | 90 days after last change | same job |
| Display name, pending email; confirmed email if no orders | `wa_identities` | 90 days after last inbound | same job |
| Replay metadata | message ids, timestamps, kinds, outcomes | kept | needed so a 7-day Meta retry is still recognised as a duplicate |
| Turn records / traces | `wa_turns` (ids, timings, outcome codes — **no text**); app logs never contain bodies | kept | — |
| Orders, payment attempts, payment events, order owners, checkout intents | M1 tables + `wa_order_owners`, `wa_checkout_intents` | **5 years** | see below |

**Five-year period — when it starts:** from the **end of the order's financial life**: the later of the order's completion/cancellation date and its last payment event (refund or reversal included). A paid order that is never closed counts from `paid_at`. No purge job is needed before 2031; the job will be added with the order-archive work.

**Backups:** Supabase Pro keeps daily backups for **7 days** (rolling). So purged text can survive in backups for up to 7 days after the purge — ≤ 97 days in total. The POPIA notice must say "deleted after 90 days (backup copies within a further 7 days)". If PITR is ever enabled, its retention window (7/14/28 days) replaces the 7. On the free plan there are no backups.

`payment_events.payload` (M1) contains the customer email from Paystack — it is a payment record and follows the 5-year rule.

## 12. Data model (2a — `supabase/005_whatsapp_agent.sql`)
`wa_settings` (cap, timezone, retention days, quote minutes, max turn attempts) · `wa_channels` (business numbers) · `wa_identities` (immutable owner_ref) · `wa_conversations` (mode, window anchor, lease) · `wa_inbound` · `wa_turns` · `product_media` · `wa_carts` + `wa_cart_items` (no prices stored) · `wa_checkout_quotes` · `wa_checkout_intents` (unique open per conversation) · `wa_order_owners` (immutable) · `wa_outbox` · `wa_model_budget` + `wa_model_reservations`.
Triggers: identity / order-owner / intent immutability; `wa_on_order_confirmed` (orders `awaiting_payment → confirmed`); `wa_on_attempt_succeeded` (paid-after-cancel marker). One M1 function replaced: `commerce_start_payment_attempt` (+ `managed_by_whatsapp` guard; otherwise identical).
All `public.commerce_wa_*` functions: `security definer`, `search_path = commerce, pg_temp`, execute granted to `service_role` only.

## 13. Customer tools (2c — the ONLY tools bound to the agent)
`search_catalogue`, `show_product`, `update_cart` → `commerce_wa_cart_set_item`, `view_cart` → `commerce_wa_cart_view`, `set_delivery` → `commerce_wa_cart_set_delivery`, `set_contact_email` → set + confirm, **`prepare_checkout` → `commerce_wa_create_quote`** (bot shows the exact total and, if replacing, the old link's total, with Yes/No buttons carrying the quote id), **`confirm_checkout(quote_id, total)` → `commerce_wa_confirm_quote`** then the link is sent via `complete_turn` `checkout_link`, `get_order_status` → `commerce_wa_customer_orders`, `request_human(category)`.
Not bound (owner-only, enforced by tests): mark packed/couriered/completed, `commerce_wa_owner_set_mode`, outbound resolve, refunds/cancels, any `commerce_owner_*`, CRM tools in `lib/agent/tools/*`.

## 14. Tests
**2a (this step) — merge gates, all on real PostgreSQL 16:**
- In-DB suite `select * from commerce.run_whatsapp_tests();` — **33 tests** (`supabase/006_whatsapp_tests.sql`), rolled back. Includes shared-email isolation (W01), paid notification to the owning conversation only (W02–03), immutability (W04), dedup/window (W05), explicit claims (W06–07), expired lease can't commit/write/consume newer inbound (W08), quote binding + replay (W09–11), retry/ambiguity → reconcile (W12), server-rendered link (W13), one-open index (W14), atomic replacement (W15), paid-after-cancel incl. repeated event: 1 exception, 0 fulfilment, 0 paid messages (W16), payment-first refusal (W17), failed replacement rolls back (W18), paused allow-list + paid during takeover (W19–21), budget and recovery of multiple reservations (W22–24), poison (W25), 24 h window + uncertain sends (W26–28), retention (W29), M1 guard (W30), privileges (W31), closed-checkout quote (W32), and rejected reply batch followed by a corrected retry (W33).
- Race suite `tests/whatsapp-postgres-2a.py` — **9 tests**. R1 concurrent "yes" → one intent. R2 cancellation first, then payment. R3 payment first, then replacement. R4 repeated late payment concurrently. R5 budget cap under 6-way concurrency. R6 claim concurrency cap. R7 stale lease with newer inbound. R8 replacement overlapping the paid-confirmation insert. R9 late model-cost settlement overlapping recovery of an expired turn.
- Milestone 1 suite still **25/25** with 005 installed.
- Mutation check (Claude, not committed): 12 deliberate breakages of 005 — each is caught by at least one test (see the Codex brief).

**2b–2e:** as in v1 (webhook signature, GET handshake, status callbacks don't reply, tool binding set exact, scripted fake model, grounding check, ~20 real-Gemini evals), plus: replies and links only ever come from `complete_turn`/outbox; uncertain send never auto-resent for links/paid confirmations.

## 15. Build order (each step = its own PR, Codex-reviewed)
| Step | PR | Exit |
|---|---|---|
| **2a** | `005` schema + functions + triggers, `006` in-DB tests, race tests | 33/33 + 9/9 + M1 25/25 on real PG16. Sanele runs the updated SQL on Supabase → 33/33. |
| 2b | WhatsApp adapter: webhook (verify + `record_inbound` + 200), WhatsApp worker route + schedule, outbound sender + status callbacks, **echo bot** (server turn, no AI) | Sanele's phone ↔ test number round-trip; duplicates ignored |
| 2c | Customer tools + agent loop (scripted fake model), grounding check, budget reservations, time budget | deterministic + scripted tests green |
| 2d | Real Gemini + evals; Paystack initialize for intents; paid notification send | evals reviewed; real test payment from WhatsApp |
| 2e | Owner page: conversations, reply as owner, take over / resume, uncertain-send decisions | handoff exit criterion |

## 16. Open items
- Rate limits per identity (2c). Abandoned unpaid intents older than 48 h (the M1 reconciler stops polling then) — close them in 2c so the "one open checkout" slot frees up; until then the customer's next quote simply replaces it.
- `@langchain/google` tool calling still **not verified live** (AGENTS.md OPEN GATE) — must pass before 2c.
- Go-live (unchanged): Supabase Pro, Paystack live activation, Next.js advisory upgrade, lockfile, POPIA notice (90 days + 7-day backups), Gemini paid tier, Meta business verification + real number, delete stale `vercel/react-server-components-cve-*` branches.

*Interactive message limits, Graph API version and pricing are re-verified against Meta's docs at 2b.*
