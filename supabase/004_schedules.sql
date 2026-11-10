-- ════════════════════════════════════════════════════════════════════════════
-- Inkanyezi Commerce — background schedules (Supabase pg_cron + pg_net)
-- File: supabase/004_schedules.sql
--
-- PART A runs entirely inside the database (no secrets). Run it as-is.
-- PART B calls your Vercel worker every 5 minutes (reconcile missed Paystack
-- webhooks + send owner alerts). It needs your CRON_SECRET, stored in Supabase
-- Vault so it never sits in plain SQL. Do PART B after the app is deployed.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART A — release lapsed stock holds every minute ────────────────────────
create extension if not exists pg_cron;

select cron.schedule(
  'commerce-release-expired-holds',
  '* * * * *',
  $$ select public.commerce_release_expired_reservations(); $$
);

-- ── PART B — call the worker every 5 minutes ────────────────────────────────
-- 1) Replace the two ✏️ values, run the two lines below ONCE, then delete the
--    secret from this editor tab (it is now stored encrypted in Vault).
--
-- select vault.create_secret('PASTE-YOUR-CRON_SECRET-HERE', 'commerce_cron_secret');           -- ✏️
-- select vault.create_secret('https://inkanyezibot-v2.vercel.app/api/commerce/cron', 'commerce_cron_url');  -- ✏️ your domain
--
-- 2) Then run this block:
--
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'commerce-worker',
--   '*/5 * * * *',
--   $$
--   select net.http_post(
--     url     := (select decrypted_secret from vault.decrypted_secrets where name = 'commerce_cron_url'),
--     headers := jsonb_build_object(
--                  'Content-Type', 'application/json',
--                  'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'commerce_cron_secret')),
--     body    := '{}'::jsonb,
--     timeout_milliseconds := 25000
--   );
--   $$
-- );

-- Check what's scheduled:
select jobname, schedule, active from cron.job;
-- Recent runs (status / errors):
-- select jobname, status, return_message, start_time from cron.job_run_details order by start_time desc limit 20;
