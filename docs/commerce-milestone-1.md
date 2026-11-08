# Milestone 1 — Headless paid-order core (browser-only setup)

**Architecture:** v0.3 · **Repo base:** `84b355c` · **Mode:** Paystack TEST only · **Date:** 26 Oct 2026

Flow delivered: Supabase schema → create order with server-side total + unique `INK-######` number + stock hold →
Paystack test hosted checkout → signed webhook → server-side verify → idempotent apply → owner fulfilment task + outbox alert.
No AI, no WhatsApp yet.

---

## Step 0 — Security clean-up first (5 min)

`app/embed/Neon Connection String.txt` contains a Neon database **password**, and this repo is **public**.

1. Open **console.neon.tech** → confirm that project is deleted. If it still exists, delete it (or reset the `neondb_owner` password).
2. On GitHub, open each of these files → **⋯ → Delete file** → commit:
   - `app/embed/Neon Connection String.txt`
   - `app/embed/Google Query Client ID-1050904323362-dltilanll3f.txt` (a client ID isn't secret, but it doesn't belong in the repo)

   Nothing in the app reads them. Deleting does **not** erase them from git history — that's why step 1 is the real fix.

## Step 1 — Create the Supabase project (5 min)

1. **supabase.com** → New project → name `inkanyezi-commerce` → region closest to SA (e.g. *eu-west* / *Frankfurt*, or *Cape Town* if offered) → generate a strong DB password and keep it in your password manager.
2. When it's ready: **Project Settings → API Keys**. You need:
   - **Project URL** (Settings → Data API) → becomes `SUPABASE_URL`
   - **Secret key** (`sb_secret_…`, or the legacy `service_role` key) → becomes `SUPABASE_SECRET_KEY`

   ⚠️ The secret key bypasses all database security. It goes **only** into Vercel env vars — never in code, never prefixed `NEXT_PUBLIC_`, never pasted into ChatGPT/Claude.

## Step 2 — Run the SQL (10 min)

Supabase → **SQL Editor** → **New query** for each file. Paste the whole file, click **Run**.

| Order | File | Expect |
|---|---|---|
| 1 | `supabase/001_commerce_core.sql` | "Success. No rows returned" |
| 2 | `supabase/002_commerce_tests.sql` | "Success" |
| 3 | run: `select * from commerce.run_core_tests();` | **21 rows, every `passed` = true** (no rows named CRASH) |
| 4 | `supabase/003_seed_test_store.sql` | 3 test products listed |
| 5 | `supabase/004_schedules.sql` (PART A only, as shipped) | `commerce-release-expired-holds` listed, active = true |

If step 3 shows any `false`, stop and send me the `test` + `detail` columns.

## Step 3 — Paystack test keys + webhook (5 min)

Paystack dashboard (toggle **Test Mode** on) → **Settings → API Keys & Webhooks**:

1. Copy the **Test Secret Key** (`sk_test_…`) → becomes `PAYSTACK_SECRET_KEY`.
2. **Test Webhook URL:** `https://inkanyezibot-v2.vercel.app/api/commerce/paystack/webhook` → Save.
3. Leave Test Callback URL empty (the app sends its own per transaction).

The app **refuses to start checkout with a live key** (`sk_live_…`). That guard stays until a go-live review.

## Step 4 — Vercel environment variables (5 min)

Vercel → project `inkanyezibot-v2` → **Settings → Environment Variables** → add each for **Production** (and Preview if you test there):

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL from step 1 |
| `SUPABASE_SECRET_KEY` | Secret key from step 1 |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` from step 3 |
| `COMMERCE_STORE_SLUG` | `inkanyezi-test` |
| `PUBLIC_BASE_URL` | `https://inkanyezibot-v2.vercel.app` |
| `OWNER_EMAILS` | your Google email (it must ALSO be in `ALLOWED_EMAILS` to sign in) |
| `CRON_SECRET` | a random 40+ character string from your password manager's generator |
| `OWNER_ALERT_WEBHOOK_URL` | *optional* — a Make.com Custom Webhook URL that pings you (WhatsApp/email). Leave unset for now if you like; tasks still show on the dashboard. |

## Step 5 — Upload the code (10 min)

The zip mirrors the repo layout. Easiest browser path:

1. Unzip `inkanyezi-milestone-1.zip` on your computer.
2. GitHub → repo → **Add file → Upload files**.
3. Open the unzipped folder and **drag in** `app`, `lib`, `supabase`, `docs`, `vercel.json` and `package.json` together. GitHub keeps the folder paths. Existing files you don't drag (dashboard, agent, chat…) are untouched.
4. Check the file list: `package.json` shows as **modified** (one line added: `@supabase/supabase-js`); everything else is **new**.
5. Commit message: `Milestone 1: headless paid-order core (Supabase + Paystack test)` → **Commit changes**.

New files:
```
app/api/commerce/orders/route.js           POST create order + checkout (owner)
app/api/commerce/checkout/route.js         POST new checkout for unpaid order (owner)
app/api/commerce/paystack/webhook/route.js POST Paystack → us (signature-verified)
app/api/commerce/cron/route.js             worker: release holds, reconcile, alerts
app/api/commerce/admin/overview/route.js   GET products/orders/tasks (owner)
app/dashboard/commerce/page.tsx            browser test harness (behind login)
app/pay/return/page.js                     customer lands here after paying
lib/commerce/{config,db,paystack,orders,payments,jobs,owner}.js
supabase/001…004_*.sql
vercel.json                                daily safety-net cron (Hobby-plan safe)
docs/commerce-milestone-1.md               this file
```

Vercel deploys automatically. Wait for **Ready** (Deployments tab). If it fails, send me the build log's red lines.

## Step 6 — Turn on the 5-minute worker (5 min)

Vercel Hobby only allows a once-a-day cron, so Supabase calls the worker every 5 minutes instead.
SQL Editor → open `supabase/004_schedules.sql` → follow **PART B**: paste your `CRON_SECRET` into the first `vault.create_secret` line, run the two Vault lines, then uncomment and run the schedule block. Clear the editor tab afterwards.

---

## Step 7 — Prove it (the exit checks)

Go to **`https://inkanyezibot-v2.vercel.app/dashboard/commerce`** (sign in with Google). Badge must say **PAYSTACK TEST MODE**.

| # | Do this | Pass when |
|---|---|---|
| 1 | 1 × TEST-WATCH-01, your email, **Collect** → *Confirm total & create checkout* | Result shows an order number like `INK-001005` (numbers used by the self-test are skipped — gaps are normal), total R1 250.00, and an *Open Paystack test checkout* link. Available drops 3 → 2. |
| 2 | Open the link, pay with a Paystack **test card** | You land on `/pay/return` saying **Payment confirmed**. |
| 3 | Back on the test page → Refresh | Order = `confirmed` / `ready_to_pack`; **pack_order** task assigned to Sanele. |
| 4 | SQL: `select event_type, reference, outcome from commerce.payment_events order by id desc;` | A `charge.success` row with outcome `applied` **or** `duplicate` (duplicate = the return page applied it first — both are correct; it was applied exactly once). |
| 5 | Last unit: order TEST-LAST-01 ×1 (don't pay), then order it again | 2nd attempt result: `insufficient_stock`. |
| 6 | Stale total: open the page, then in SQL run `update commerce.products set price_cents = 130000 where sku='TEST-WATCH-01';`, then submit TEST-WATCH-01 **without refreshing** | Result: `total_changed` with the new total. (Set it back to `125000` after.) |
| 7 | Courier with no price set | Result: `delivery_not_priced` + a **price_delivery** task. |
| 8 | Fulfil by hand (SQL, replace the number):<br>`select public.commerce_owner_mark_packed('INK-001005','sanele');`<br>`select public.commerce_owner_mark_handed_to_courier('INK-001005','Manual courier','TRK123','sanele');` | Both return `{"ok": true}`. Test page: on_hand for TEST-WATCH-01 drops 3 → 2 (once), task disappears. Running the 2nd line again returns `invalid_transition`. |
| 9 | *Run worker now* | JSON with `released`, `reconciled`, `jobs`. |
| 10 | Leave test #5's unpaid order for 30+ min | TEST-LAST-01 becomes available again. |

When 1–10 pass, Milestone 1 (Phases 1 + the thin slice of 2 from v0.3) is done → next is the WhatsApp customer agent (Phase 3).

---

## What's verified vs not (be honest about this line)

**Verified by Claude before handoff (26 Oct 2026):**
- All SQL runs on a real PostgreSQL engine; the 21 in-database tests pass and leave no data behind.
- `next build` (incl. type-check) passes with the new files on top of `84b355c`.
- Running server: forged webhook signature → 401; valid signature + DB down → 500 (Paystack retries); owner routes and `/dashboard/commerce` refuse anonymous access; return page never says "paid" without server verification.

**Not yet verified (needs your accounts):**
- Real Supabase project (Supabase-specific roles, pg_cron, Vault, pg_net).
- Real Paystack test-mode initialize/verify/webhook round-trip, and ZAR availability on your Paystack account (D5 still "candidate").
- Truly simultaneous last-unit purchases — tested sequentially; concurrency safety relies on Postgres row locks (`FOR UPDATE`), which is the standard mechanism but hasn't been load-tested here.

## Design notes (for the decision log, §17)

- **D19 (new):** transactional logic lives in Postgres functions (`public.commerce_*`, service-role only); tables in a private `commerce` schema. Lets the core be tested from the browser SQL editor and makes every transition atomic.
- **D20 (new):** payment applied only from Paystack *verify* results; webhook, reconciler and return page all call the same idempotent function.
- **D21 (new):** payment-attempt state `mismatch_held` added to v0.3's list (money arrived, wrong amount/currency → owner reconciles).
- **D22 (new):** worker cadence = Supabase pg_cron + pg_net every 5 min; Vercel Cron daily as safety net (Hobby limit).
- Milestone-1 simplifications: one row = one sellable SKU (variants later); an expired hold blocks a *new* checkout (customer re-orders) but a *late payment* is still honoured via revalidation; unknown-reference tasks attach to the first store (single-store for now).
- **Go-live blockers (not Milestone 1):** Paystack live activation needs business documents (D9 open — registration/tax status), POPIA retention for `payment_events.payload`, and Next.js `15.3.6` has a published security advisory — upgrade in a separate change.
