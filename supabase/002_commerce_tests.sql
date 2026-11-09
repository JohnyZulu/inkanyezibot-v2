-- ════════════════════════════════════════════════════════════════════════════
-- Inkanyezi Commerce — Milestone 1 core tests (run inside the database)
-- File: supabase/002_commerce_tests.sql
--
-- 1) Paste this file into SQL Editor → Run   (creates the test function)
-- 2) Then run:   select * from commerce.run_core_tests();
--    Every row must say passed = true.
--
-- The tests create a throw-away store, exercise the real functions, and then
-- ROLL EVERYTHING BACK — no test data is left behind. Order-number sequence
-- values used by the tests are skipped (gaps are normal and harmless).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function commerce.run_core_tests()
returns table (test text, passed boolean, detail text)
language plpgsql as $$
declare
  v_results  jsonb := '[]';
  v_store    uuid;
  r          jsonb;
  r2         jsonb;
  v_order    uuid;
  v_order2   uuid;
  v_num      text;
  v_ref      text;
  v_ref2     text;
  v_int      int;
  v_txt      text;

  -- tiny assertion helper via a nested function is not possible in plpgsql,
  -- so we append results inline: v_results := v_results || jsonb_build_object(...)
begin
  begin  -- ── everything inside this block is rolled back at the end ──

    insert into commerce.stores (slug, name, owner_name, flat_delivery_cents, reservation_minutes)
    values ('zz-test-suite', 'Test Suite Store', 'Test Owner', 9900, 30) returning id into v_store;
    insert into commerce.products (store_id, sku, name, price_cents, currency, on_hand) values
      (v_store, 'T-WATCH', 'Test Watch', 125000, 'ZAR', 3),
      (v_store, 'T-LAST',  'Last Unit',   85000, 'ZAR', 1);

    -- T1 server-side total (client cannot set price; delivery added)
    r := public.commerce_create_order('zz-test-suite', '{"email":"A@Example.com"}',
           '[{"sku":"t-watch","qty":2,"price_cents":1}]',
           '{"method":"courier","line1":"1 Test Rd","city":"Durban","postal_code":"4001"}', null, 'k1', 'test');
    v_order := (r->>'order_id')::uuid; v_num := r->>'order_number';
    v_results := v_results || jsonb_build_object('t','T01 server-side total = 2×1250 + 99 delivery',
      'ok', (r->>'ok')::bool and (r->>'total_cents')::bigint = 259900, 'd', r::text);

    -- T2 order number format + uniqueness
    v_results := v_results || jsonb_build_object('t','T02 order number INK-###### and email lower-cased',
      'ok', v_num ~ '^INK-[0-9]{6}$' and exists(select 1 from commerce.customers where email='a@example.com'), 'd', v_num);

    -- T3 idempotent replay returns same order
    r2 := public.commerce_create_order('zz-test-suite', '{"email":"a@example.com"}',
           '[{"sku":"T-WATCH","qty":2}]', '{"method":"courier","line1":"1 Test Rd","city":"Durban","postal_code":"4001"}',
           null, 'k1', 'test');
    v_results := v_results || jsonb_build_object('t','T03 same idempotency key → same order, no second hold',
      'ok', (r2->>'replayed')::bool and r2->>'order_id' = v_order::text
            and commerce.available_qty((select id from commerce.products where sku='T-WATCH' and store_id=v_store)) = 1,
      'd', r2::text);

    -- T4 stale confirmed total rejected
    r := public.commerce_create_order('zz-test-suite', '{"email":"b@example.com"}', '[{"sku":"T-WATCH","qty":1}]',
           '{"method":"collect"}', 99999, null, 'test');
    v_results := v_results || jsonb_build_object('t','T04 customer-confirmed total differs → total_changed',
      'ok', r->>'code' = 'total_changed' and (r->>'total_cents')::bigint = 125000, 'd', r::text);

    -- T5 last unit: first wins, second refused (no oversell)
    r := public.commerce_create_order('zz-test-suite', '{"email":"c@example.com"}', '[{"sku":"T-LAST","qty":1}]',
           '{"method":"collect"}', 85000, null, 'test');
    v_order2 := (r->>'order_id')::uuid;
    r2 := public.commerce_create_order('zz-test-suite', '{"email":"d@example.com"}', '[{"sku":"T-LAST","qty":1}]',
           '{"method":"collect"}', null, null, 'test');
    v_results := v_results || jsonb_build_object('t','T05 last unit: 2nd buyer gets insufficient_stock',
      'ok', (r->>'ok')::bool and r2->>'code' = 'insufficient_stock', 'd', r2::text);

    -- T6 invalid inputs refused
    r  := public.commerce_create_order('zz-test-suite', '{"email":"nope"}', '[{"sku":"T-WATCH","qty":1}]', '{"method":"collect"}');
    r2 := public.commerce_create_order('zz-test-suite', '{"email":"e@example.com"}', '[{"sku":"T-WATCH","qty":11}]', '{"method":"collect"}');
    v_results := v_results || jsonb_build_object('t','T06 bad email / qty>10 / unknown sku refused',
      'ok', r->>'code'='invalid_email' and r2->>'code'='invalid_quantity'
            and public.commerce_create_order('zz-test-suite','{"email":"e@example.com"}','[{"sku":"NOPE","qty":1}]','{"method":"collect"}')->>'code' = 'unknown_or_inactive_sku',
      'd', r::text || ' / ' || r2::text);

    -- T7 payment attempt reuse on double-click
    r := public.commerce_start_payment_attempt(v_order, 'test');
    v_ref := r->>'reference';
    perform public.commerce_attach_checkout((r->>'attempt_id')::uuid, 'https://checkout.paystack.com/test', 'ac_test');
    r2 := public.commerce_start_payment_attempt(v_order, 'test');
    v_results := v_results || jsonb_build_object('t','T07 attempt ref = order-1, double-click reuses it',
      'ok', v_ref = v_num || '-1' and (r2->>'reused')::bool and r2->>'reference' = v_ref, 'd', r2::text);

    -- T8 amount mismatch is HELD, order not confirmed, urgent task opened
    r := public.commerce_apply_verified_payment(v_ref, 'success', 100, 'ZAR', 'txn-1', 'test');
    v_results := v_results || jsonb_build_object('t','T08 underpayment → mismatch_held + owner task, order stays unpaid',
      'ok', r->>'outcome'='mismatch_held'
            and (select status from commerce.orders where id=v_order) = 'awaiting_payment'
            and exists(select 1 from commerce.handoff_tasks where active_key like 'mismatch:%' and order_id=v_order),
      'd', r::text);

    -- T9 correct payment on a new attempt → confirmed, allocated, pack task, one outbox job
    r := public.commerce_start_payment_attempt(v_order, 'test'); v_ref2 := r->>'reference';
    r := public.commerce_apply_verified_payment(v_ref2, 'success', 259900, 'zar', 'txn-2', 'webhook');
    v_results := v_results || jsonb_build_object('t','T09 verified payment → confirmed/ready_to_pack, allocated, task+job',
      'ok', r->>'outcome'='applied'
            and (select status||'/'||fulfilment_status from commerce.orders where id=v_order) = 'confirmed/ready_to_pack'
            and (select count(*) from commerce.stock_reservations where order_id=v_order and status='allocated') = 1
            and (select count(*) from commerce.handoff_tasks where active_key='pack:'||v_order) = 1
            and (select count(*) from commerce.jobs where dedup_key='notify_paid:'||v_order) = 1,
      'd', r::text);

    -- T10 duplicate event (same reference again) is a no-op
    r := public.commerce_apply_verified_payment(v_ref2, 'success', 259900, 'ZAR', 'txn-2', 'reconcile');
    v_results := v_results || jsonb_build_object('t','T10 same payment applied twice → duplicate, nothing doubled',
      'ok', r->>'outcome'='duplicate'
            and (select count(*) from commerce.handoff_tasks where active_key='pack:'||v_order) = 1
            and (select count(*) from commerce.jobs where dedup_key='notify_paid:'||v_order) = 1,
      'd', r::text);

    -- T11 out-of-order 'failed' after success cannot regress
    r := public.commerce_apply_verified_payment(v_ref2, 'failed', 259900, 'ZAR', 'txn-2', 'webhook');
    v_results := v_results || jsonb_build_object('t','T11 late "failed" after success → no regression',
      'ok', (select status from commerce.payment_attempts where reference=v_ref2)='succeeded'
            and (select status from commerce.orders where id=v_order)='confirmed', 'd', r::text);

    -- T12 unknown reference → owner task, no crash
    r := public.commerce_apply_verified_payment('INK-999999-9', 'success', 100, 'ZAR', 'txn-x', 'webhook');
    v_results := v_results || jsonb_build_object('t','T12 unknown reference → urgent owner task',
      'ok', r->>'outcome'='unknown_reference'
            and exists(select 1 from commerce.handoff_tasks where active_key='unknownref:INK-999999-9'), 'd', r::text);

    -- T13 paying a confirmed order again (other attempt) → duplicate_payment flag
    update commerce.payment_attempts set status='pending', received_amount_cents=null where reference=v_ref;  -- simulate 2nd real charge on attempt 1
    r := public.commerce_apply_verified_payment(v_ref, 'success', 259900, 'ZAR', 'txn-3', 'webhook');
    v_results := v_results || jsonb_build_object('t','T13 second real charge on paid order → duplicate_payment task',
      'ok', r->>'outcome'='duplicate_payment'
            and exists(select 1 from commerce.orders where id=v_order and 'duplicate_payment' = any(exception_flags)),
      'd', r::text);

    -- T14 fulfilment: no double subtraction of stock
    v_int := (select on_hand from commerce.products where sku='T-WATCH' and store_id=v_store);  -- 3
    r  := public.commerce_owner_mark_handed_to_courier(v_num, 'X', null, 'test');              -- must fail: not packed
    perform public.commerce_owner_mark_packed(v_num, 'test');
    perform public.commerce_owner_mark_handed_to_courier(v_num, 'The Courier Guy', 'TRK1', 'test');
    r2 := public.commerce_owner_mark_handed_to_courier(v_num, 'The Courier Guy', 'TRK1', 'test'); -- repeat must fail
    v_results := v_results || jsonb_build_object('t','T14 handed_to_courier: on_hand 3→1 once; available stays 1',
      'ok', r->>'code'='invalid_transition' and r2->>'code'='invalid_transition'
            and v_int = 3
            and (select on_hand from commerce.products where sku='T-WATCH' and store_id=v_store) = 1
            and commerce.available_qty((select id from commerce.products where sku='T-WATCH' and store_id=v_store)) = 1
            and (select status from commerce.handoff_tasks where active_key='pack:'||v_order) = 'resolved',
      'd', r2::text);

    -- T15 expired hold: availability frees immediately; checkout refused
    update commerce.stock_reservations set expires_at = now() - interval '1 minute' where order_id = v_order2;
    r := public.commerce_start_payment_attempt(v_order2, 'test');
    v_results := v_results || jsonb_build_object('t','T15 expired hold → stock available again, new checkout refused',
      'ok', r->>'code'='reservation_expired'
            and commerce.available_qty((select id from commerce.products where sku='T-LAST' and store_id=v_store)) = 1
            and public.commerce_release_expired_reservations() >= 1, 'd', r::text);

    -- T16 late payment, stock still free → restocked and confirmed
    insert into commerce.payment_attempts (store_id, order_id, attempt_no, reference, amount_cents, currency)
      values (v_store, v_order2, 1, 'LATE-OK-1', 85000, 'ZAR');
    r := public.commerce_apply_verified_payment('LATE-OK-1', 'success', 85000, 'ZAR', 'txn-4', 'reconcile');
    v_results := v_results || jsonb_build_object('t','T16 late payment, unit still free → confirmed + allocated',
      'ok', r->>'outcome'='applied' and not (r->>'on_hold')::bool
            and commerce.available_qty((select id from commerce.products where sku='T-LAST' and store_id=v_store)) = 0,
      'd', r::text);

    -- T17 late payment, stock gone → money recorded, fulfilment on_hold, urgent task, NO oversell
    update commerce.products set on_hand = 2 where sku='T-LAST' and store_id=v_store;
    r := public.commerce_create_order('zz-test-suite', '{"email":"f@example.com"}', '[{"sku":"T-LAST","qty":1}]', '{"method":"collect"}');
    v_order := (r->>'order_id')::uuid;
    update commerce.stock_reservations set expires_at = now() - interval '1 minute' where order_id = v_order;
    r2 := public.commerce_create_order('zz-test-suite', '{"email":"g@example.com"}', '[{"sku":"T-LAST","qty":1}]', '{"method":"collect"}'); -- takes the unit
    insert into commerce.payment_attempts (store_id, order_id, attempt_no, reference, amount_cents, currency)
      values (v_store, v_order, 1, 'LATE-GONE-1', 85000, 'ZAR');
    r := public.commerce_apply_verified_payment('LATE-GONE-1', 'success', 85000, 'ZAR', 'txn-5', 'reconcile');
    v_results := v_results || jsonb_build_object('t','T17 late payment, stock gone → paid + on_hold + task, no oversell',
      'ok', r->>'outcome'='applied' and (r->>'on_hold')::bool and (r2->>'ok')::bool
            and (select fulfilment_status from commerce.orders where id=v_order)='on_hold'
            and (select status from commerce.payment_attempts where reference='LATE-GONE-1')='succeeded'
            and commerce.available_qty((select id from commerce.products where sku='T-LAST' and store_id=v_store)) = 0
            and exists(select 1 from commerce.handoff_tasks where active_key='latestock:'||v_order),
      'd', r::text);

    -- T18 courier with no delivery price → refused + human task (before payment)
    update commerce.stores set flat_delivery_cents = null where id = v_store;
    r := public.commerce_create_order('zz-test-suite', '{"email":"h@example.com"}', '[{"sku":"T-WATCH","qty":1}]',
           '{"method":"courier","line1":"1 Rd","city":"Durban","postal_code":"4001"}');
    v_results := v_results || jsonb_build_object('t','T18 unpriced courier → delivery_not_priced + support task',
      'ok', r->>'code'='delivery_not_priced'
            and exists(select 1 from commerce.handoff_tasks where active_key='price_delivery:h@example.com'), 'd', r::text);

    -- T19 event dedup
    r  := public.commerce_record_payment_event('paystack','paystack:charge.success:1','charge.success','X','{}');
    r2 := public.commerce_record_payment_event('paystack','paystack:charge.success:1','charge.success','X','{}');
    v_results := v_results || jsonb_build_object('t','T19 same provider event twice → stored once',
      'ok', (r->>'is_new')::bool and not (r2->>'is_new')::bool, 'd', r2::text);

    -- T20 outbox claim/complete with retry backoff
    select id::text into v_txt from public.commerce_claim_jobs(10) limit 1;
    perform public.commerce_complete_job(v_txt::bigint, false, 'simulated outage');
    v_results := v_results || jsonb_build_object('t','T20 failed job → back to pending with backoff, error kept',
      'ok', (select status = 'pending' and run_after > now() and last_error = 'simulated outage'
               from commerce.jobs where id = v_txt::bigint), 'd', coalesce(v_txt,'no job'));

    -- T21 API surface is not callable by anon/authenticated (only if Supabase roles exist)
    v_results := v_results || jsonb_build_object('t','T21 anon/authenticated cannot execute commerce_* functions',
      'ok', not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace, pg_roles ro
         where n.nspname='public' and p.proname like 'commerce\_%' and ro.rolname in ('anon','authenticated')
           and has_function_privilege(ro.oid, p.oid, 'execute')), 'd', 'checked pg privileges');

    -- T22 reconciler rotation is fair (Codex review P2): a batch can't be re-served while others wait
    update commerce.payment_attempts set status = 'cancelled'
     where store_id = v_store and status in ('pending','unknown');           -- isolate from earlier tests
    r := public.commerce_create_order('zz-test-suite', '{"email":"rot@example.com"}', '[{"sku":"T-WATCH","qty":1}]', '{"method":"collect"}');
    insert into commerce.payment_attempts (store_id, order_id, attempt_no, reference, amount_cents, currency, created_at)
    select v_store, (r->>'order_id')::uuid, n, 'ROT-' || n, 125000, 'ZAR', now() - make_interval(mins => 10 + n)
      from generate_series(1, 3) n;
    -- Simulate 4 worker runs that each have time for exactly ONE check: claim → (verify) → release.
    v_txt := '';
    for v_int in 1..4 loop
      select reference, claim_token::text into v_ref, v_num from public.commerce_claim_reconcile_attempt(60);
      v_txt := v_txt || coalesce(v_ref, '∅') || ' ';
      perform public.commerce_release_reconcile_claim(v_ref, v_num::uuid);
    end loop;
    v_results := v_results || jsonb_build_object('t','T22 reconcile rotation: one-per-run worker checks all 3 before repeating',
      'ok', v_txt = 'ROT-3 ROT-2 ROT-1 ROT-3 ', 'd', v_txt);   -- oldest first, then least-recently-checked

    -- T23 lease: a live claim can't be re-claimed after commit; wrong token can't release; expired lease can be re-claimed
    select reference, claim_token::text into v_ref, v_num from public.commerce_claim_reconcile_attempt(60);  -- held, not released
    v_txt := '';
    for v_int in 1..3 loop                                    -- other workers keep claiming (and holding) what's left
      r2 := (select to_jsonb(c) from public.commerce_claim_reconcile_attempt(60) c);
      v_txt := v_txt || coalesce(r2->>'reference', '∅') || ' ';
    end loop;
    r := jsonb_build_object(
      'held_not_reclaimed', v_txt not like '%' || v_ref || '%' and v_txt like '%∅%',
      'wrong_token_refused', not public.commerce_release_reconcile_claim(v_ref, gen_random_uuid()),
      'still_ours', (select reconcile_claim_token::text from commerce.payment_attempts where reference = v_ref) = v_num);
    update commerce.payment_attempts set reconcile_lease_until = clock_timestamp() - interval '1 second'
     where reference = v_ref;                                 -- simulate a worker that died: lease runs out
    select reference into v_txt from public.commerce_claim_reconcile_attempt(60);
    v_results := v_results || jsonb_build_object('t','T23 lease: in-flight attempt not re-claimable; wrong token refused; expiry frees it',
      'ok', (r->>'held_not_reclaimed')::bool and (r->>'wrong_token_refused')::bool and (r->>'still_ours')::bool
            and v_txt = v_ref,
      'd', r::text || ' reclaimed after expiry: ' || coalesce(v_txt,'∅'));

    -- T24 payment after the hold expired (by the real clock) never allocates the lapsed hold
    update commerce.products set on_hand = on_hand + 5 where sku = 'T-WATCH' and store_id = v_store;
    r := public.commerce_create_order('zz-test-suite', '{"email":"clk@example.com"}', '[{"sku":"T-WATCH","qty":1}]', '{"method":"collect"}');
    update commerce.stock_reservations set expires_at = clock_timestamp() - interval '1 second' where order_id = (r->>'order_id')::uuid;
    insert into commerce.payment_attempts (store_id, order_id, attempt_no, reference, amount_cents, currency)
      values (v_store, (r->>'order_id')::uuid, 1, 'CLK-1', 125000, 'ZAR');
    r2 := public.commerce_apply_verified_payment('CLK-1', 'success', 125000, 'ZAR', 'txn-clk', 'webhook');
    v_results := v_results || jsonb_build_object('t','T24 expired hold is revalidated, not blindly allocated',
      'ok', r2->>'outcome' = 'applied' and not (r2->>'on_hold')::bool
            and (select count(*) from commerce.stock_reservations where order_id = (r->>'order_id')::uuid and status = 'released') = 1
            and (select count(*) from commerce.stock_reservations where order_id = (r->>'order_id')::uuid and status = 'allocated') = 1
            and exists (select 1 from commerce.audit_events where entity_id = (r->>'order_id')::uuid
                          and action = 'late_payment_restocked'),
      'd', r2::text);

    raise exception 'ROLLBACK_TEST_DATA';
  exception
    when raise_exception then
      if sqlerrm <> 'ROLLBACK_TEST_DATA' then
        v_results := v_results || jsonb_build_object('t','CRASH','ok',false,'d',sqlerrm);
      end if;
    when others then
      v_results := v_results || jsonb_build_object('t','CRASH','ok',false,'d',sqlstate || ' ' || sqlerrm);
  end;

  return query select x->>'t', (x->>'ok')::boolean, x->>'d' from jsonb_array_elements(v_results) x;
end $$;

revoke all on function commerce.run_core_tests() from public;
