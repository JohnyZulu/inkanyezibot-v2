-- ════════════════════════════════════════════════════════════════════════════
-- Inkanyezi Commerce — RESET (test projects only)
-- File: supabase/000_reset_commerce.sql
--
-- Use ONLY if you already ran an older 001_commerce_core.sql and need to start clean.
-- It deletes the whole commerce schema: every table, order, payment record and test
-- product, plus the public.commerce_* functions and the commerce cron job.
-- NEVER run this on a project with real customer orders.
--
-- After it: run 001 → 002 → select * from commerce.run_core_tests(); → 003 → 004 (Part A).
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare f record;
begin
  -- scheduled job from 004 (only if pg_cron is installed and the job exists)
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname in ('commerce-release-expired-holds', 'commerce-worker');
  end if;

  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'commerce\_%' loop
    execute format('drop function %s', f.sig);
  end loop;
end $$;

drop schema if exists commerce cascade;

-- Check (should return 0 and 0):
select (select count(*) from pg_namespace where nspname = 'commerce') as commerce_schema,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'commerce\_%') as commerce_functions;
