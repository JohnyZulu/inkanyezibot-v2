-- ════════════════════════════════════════════════════════════════════════════
-- Inkanyezi Commerce — Milestone 2 step 2a tests (run inside the database)
-- File: supabase/006_whatsapp_tests.sql
--
-- 1) Paste this file into SQL Editor → Run   (creates the test functions)
-- 2) Then run:   select * from commerce.run_whatsapp_tests();
--    Every row must say passed = true.
--
-- Like 002, everything happens in a throw-away store and is ROLLED BACK at the end.
-- Multi-connection race tests (two sessions really blocking each other) live in
-- tests/whatsapp-postgres-2a.py — Codex runs those on a disposable PostgreSQL 16.
-- ════════════════════════════════════════════════════════════════════════════

-- Small helpers used only by the tests (internal schema, not callable via the API).
create or replace function commerce.wa_t_msg(p_from text, p_msgid text, p_body text default 'hi',
                                             p_reply text default null, p_at timestamptz default null)
returns jsonb language sql as $$
  select public.commerce_wa_record_inbound('999000111', p_from, p_msgid, coalesce(p_at, clock_timestamp()),
           case when p_reply is null then 'text' else 'button' end, p_body, p_reply, null, 'Test Person');
$$;

create or replace function commerce.wa_t_turn(p_conv uuid) returns jsonb language sql as $$
  select public.commerce_wa_claim_turn(p_conv, 60, 50);
$$;

-- message → turn → basket → collect → email (set + confirm) → quote → confirm → URL attached → turn committed.
create or replace function commerce.wa_t_checkout(p_from text, p_sku text, p_qty int, p_email text, p_tag text)
returns jsonb language plpgsql as $$
declare m jsonb; t jsonb; tid uuid; tok uuid; q jsonb; c jsonb; i jsonb; a jsonb;
begin
  m := commerce.wa_t_msg(p_from, 'wamid.' || p_tag, 'I want ' || p_sku);
  t := commerce.wa_t_turn((m->>'conversation_id')::uuid);
  tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
  perform public.commerce_wa_cart_set_item(tid, tok, p_sku, p_qty);
  perform public.commerce_wa_cart_set_delivery(tid, tok, '{"method":"collect"}');
  perform public.commerce_wa_set_contact_email(tid, tok, p_email);
  perform public.commerce_wa_confirm_contact_email(tid, tok, p_email);
  q := public.commerce_wa_create_quote(tid, tok);
  c := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
  i := public.commerce_wa_checkout_claim_init((c->>'intent_id')::uuid);
  a := public.commerce_wa_checkout_attach((c->>'intent_id')::uuid, i->>'reference', 'https://checkout.example/' || p_tag, 'ac_' || p_tag);
  perform public.commerce_wa_complete_turn(tid, tok, jsonb_build_array(jsonb_build_object('purpose','checkout_link','intent_id',c->>'intent_id')));
  return jsonb_build_object('conv', m->>'conversation_id', 'quote', q, 'confirm', c, 'init', i, 'attach', a,
                            'intent_id', c->>'intent_id', 'reference', c->>'reference', 'order_number', c->>'order_number',
                            'order_id', (select order_id from commerce.wa_checkout_intents where id = (c->>'intent_id')::uuid));
end $$;

create or replace function commerce.run_whatsapp_tests()
returns table (test text, passed boolean, detail text)
language plpgsql as $$
declare
  v_results jsonb := '[]';
  v_store uuid; v_chan uuid;
  A jsonb; B jsonb; r jsonb; r2 jsonb; r3 jsonb; t jsonb; t2 jsonb; m jsonb; q jsonb; q2 jsonb;
  tid uuid; tok uuid; tid2 uuid; tok2 uuid; v_conv uuid; v_int uuid; v_int2 uuid; v_order uuid; v_ref text;
  v_n int; v_n2 int; v_ok boolean; v_txt text; v_id bigint;
begin
  begin  -- ── everything inside this block is rolled back at the end ──
    insert into commerce.stores (slug, name, owner_name, flat_delivery_cents, reservation_minutes)
    values ('zz-wa-suite', 'WA Suite Store', 'Test Owner', 9900, 30) returning id into v_store;
    insert into commerce.products (store_id, sku, name, price_cents, currency, on_hand) values
      (v_store, 'W-A', 'Heritage Test', 125000, 'ZAR', 3),
      (v_store, 'W-B', 'Hybrid Test',    50000, 'ZAR', 5),
      (v_store, 'W-LAST', 'Last Unit',   85000, 'ZAR', 1);
    insert into commerce.wa_channels (store_id, phone_number_id, label) values (v_store, '999000111', 'suite')
      returning id into v_chan;

    -- ── W01 ownership: two senders, SAME receipt email, stay isolated ─────────
    A := commerce.wa_t_checkout('27820000001', 'W-A', 1, 'shared@example.com', 'a1');
    B := commerce.wa_t_checkout('27820000002', 'W-B', 1, 'Shared@Example.com', 'b1');
    m := commerce.wa_t_msg('27820000002', 'wamid.b-status', 'status of ' || (A->>'order_number'));
    t := commerce.wa_t_turn((m->>'conversation_id')::uuid); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    r  := public.commerce_wa_customer_orders(tid, tok, A->>'order_number');     -- B asks for A's order
    r2 := public.commerce_wa_customer_orders(tid, tok, 'INK-999999');           -- nonexistent
    r3 := public.commerce_wa_customer_orders(tid, tok, null);                   -- B's own list
    v_results := v_results || jsonb_build_object('t','W01 two senders sharing one receipt email see only their own orders',
      'ok', (A->'confirm'->>'ok')::bool and (B->'confirm'->>'ok')::bool
            and (select count(distinct customer_id) from commerce.orders where id in ((A->>'order_id')::uuid,(B->>'order_id')::uuid)) = 1
            and (select count(distinct owner_ref) from commerce.wa_order_owners where order_id in ((A->>'order_id')::uuid,(B->>'order_id')::uuid)) = 2
            and r = r2 and r->>'code' = 'order_not_found'
            and jsonb_array_length(r3->'orders') = 1 and r3->'orders'->0->>'order_number' = B->>'order_number',
      'd', r::text || ' | ' || r3::text);
    -- paid notification goes to the OWNER's conversation, not to "whoever has that email"
    v_ref := A->>'reference';
    r := public.commerce_apply_verified_payment(v_ref, 'success', 125000, 'ZAR', 'txn-a1', 'webhook');
    v_results := v_results || jsonb_build_object('t','W02 paid confirmation is queued once, for the owning conversation only',
      'ok', r->>'outcome' = 'applied'
            and (select count(*) from commerce.wa_outbox where purpose = 'paid_confirmation' and dedup_key = 'paid:' || (A->>'order_id')) = 1
            and (select conversation_id::text from commerce.wa_outbox where dedup_key = 'paid:' || (A->>'order_id')) = A->>'conv'
            and (select count(*) from commerce.wa_outbox where purpose = 'paid_confirmation' and conversation_id = (B->>'conv')::uuid) = 0
            and (select payload->>'total_cents' from commerce.wa_outbox where dedup_key = 'paid:' || (A->>'order_id')) = '125000'
            and (select status from commerce.wa_checkout_intents where id = (A->>'intent_id')::uuid) = 'paid',
      'd', r::text);
    r := public.commerce_apply_verified_payment(v_ref, 'success', 125000, 'ZAR', 'txn-a1', 'reconcile');
    v_results := v_results || jsonb_build_object('t','W03 repeated payment event → no second paid confirmation',
      'ok', r->>'outcome' = 'duplicate'
            and (select count(*) from commerce.wa_outbox where purpose = 'paid_confirmation' and conversation_id = (A->>'conv')::uuid) = 1,
      'd', r::text);

    -- ── W04 immutability ─────────────────────────────────────────────────────
    v_n := 0;
    begin update commerce.wa_identities set owner_ref = gen_random_uuid() where channel_id = v_chan;
    exception when raise_exception then v_n := v_n + 1; end;
    begin update commerce.wa_identities set wa_id = '27829999999' where channel_id = v_chan;
    exception when raise_exception then v_n := v_n + 1; end;
    begin update commerce.wa_order_owners set owner_ref = gen_random_uuid() where store_id = v_store;
    exception when raise_exception then v_n := v_n + 1; end;
    begin delete from commerce.wa_order_owners where store_id = v_store;
    exception when raise_exception then v_n := v_n + 1; end;
    begin update commerce.wa_checkout_intents set owner_ref = gen_random_uuid() where store_id = v_store;
    exception when raise_exception then v_n := v_n + 1; end;
    v_results := v_results || jsonb_build_object('t','W04 owner_ref / sender / order owner / intent owner are immutable',
      'ok', v_n = 5, 'd', v_n || ' of 5 refused');

    -- ── W05 inbound dedup + window never moves backwards ─────────────────────
    r  := commerce.wa_t_msg('27820000003', 'wamid.dup', 'first', null, clock_timestamp() - interval '1 minute');
    r2 := commerce.wa_t_msg('27820000003', 'wamid.dup', 'first', null, clock_timestamp() - interval '1 minute');
    v_conv := (r->>'conversation_id')::uuid;
    perform commerce.wa_t_msg('27820000003', 'wamid.old', 'late redelivery', null, clock_timestamp() - interval '3 hours');
    v_results := v_results || jsonb_build_object('t','W05 duplicate delivery stored once; late redelivery does not rewind the 24h window',
      'ok', (r->>'is_new')::bool and not (r2->>'is_new')::bool
            and (select count(*) from commerce.wa_inbound where wa_message_id = 'wamid.dup') = 1
            and (select last_inbound_at from commerce.wa_conversations where id = v_conv) > clock_timestamp() - interval '2 minutes'
            and (select count(*) from commerce.wa_inbound where conversation_id = v_conv and answered_at is null) = 2,
      'd', r2::text);

    -- ── W06 explicit claim: commit answers ONLY the claimed ids ───────────────
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    perform commerce.wa_t_msg('27820000003', 'wamid.newer', 'arrived during the turn');
    r := public.commerce_wa_complete_turn(tid, tok, '[{"purpose":"reply","text":"Sawubona! How can I help?"}]');
    v_results := v_results || jsonb_build_object('t','W06 turn commits reply + answered together; newer inbound left for next turn',
      'ok', (r->>'ok')::bool and (r->>'unanswered_remaining')::int = 1
            and jsonb_array_length(t->'message_ids') = 2
            and (select answered_at from commerce.wa_inbound where wa_message_id = 'wamid.newer') is null
            and (select count(*) from commerce.wa_outbox where turn_id = tid and purpose = 'reply') = 1
            and (select current_turn_id from commerce.wa_conversations where id = v_conv) is null,
      'd', r::text);
    r2 := public.commerce_wa_complete_turn(tid, tok, '[{"purpose":"reply","text":"again"}]');
    v_results := v_results || jsonb_build_object('t','W07 retried commit of the same turn is a no-op (no duplicate reply)',
      'ok', (r2->>'replayed')::bool and (select count(*) from commerce.wa_outbox where turn_id = tid) = 1, 'd', r2::text);

    -- ── W08 expired lease: no reply, no writes, cannot consume newer inbound ──
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    update commerce.wa_conversations set turn_lease_until = clock_timestamp() - interval '1 second' where id = v_conv;
    perform commerce.wa_t_msg('27820000003', 'wamid.after-expiry', 'hello?');
    r  := public.commerce_wa_complete_turn(tid, tok, '[{"purpose":"reply","text":"stale reply"}]');
    r2 := public.commerce_wa_cart_set_item(tid, tok, 'W-A', 1);
    t2 := commerce.wa_t_turn(v_conv); tid2 := (t2->>'turn_id')::uuid; tok2 := (t2->>'lease_token')::uuid;
    r3 := public.commerce_wa_complete_turn(tid, tok, '[{"purpose":"reply","text":"stale reply"}]');
    v_results := v_results || jsonb_build_object('t','W08 expired lease cannot commit, write, or consume newer inbound; next claim takes over',
      'ok', r->>'code' = 'lease_lost' and r2->>'code' = 'lease_lost' and r3->>'code' = 'lease_lost'
            and (select count(*) from commerce.wa_outbox where turn_id = tid) = 0
            and (select status from commerce.wa_turns where id = tid) = 'abandoned'
            and (t2->>'claimed')::bool and jsonb_array_length(t2->'message_ids') = 2
            and (select count(*) from commerce.wa_inbound where conversation_id = v_conv and answered_at is null) = 2
            and not exists (select 1 from commerce.wa_cart_items ci join commerce.wa_carts c on c.id = ci.cart_id where c.conversation_id = v_conv),
      'd', r::text || ' | ' || t2::text);
    perform public.commerce_wa_complete_turn(tid2, tok2, '[]', 'no_reply');

    -- ── W09 quote binding: total mismatch / cart changed / superseded / replay ─
    m := commerce.wa_t_msg('27820000004', 'wamid.q1', 'buy');
    v_conv := (m->>'conversation_id')::uuid;
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    perform public.commerce_wa_cart_set_item(tid, tok, 'W-B', 2);
    r := public.commerce_wa_create_quote(tid, tok);                       -- no email yet
    perform public.commerce_wa_cart_set_delivery(tid, tok, '{"method":"courier","line1":"1 Marine Pde","city":"Durban","postal_code":"4001"}');
    perform public.commerce_wa_set_contact_email(tid, tok, 'q@example.com');
    r2 := public.commerce_wa_confirm_contact_email(tid, tok, 'other@example.com');   -- read-back mismatch
    perform public.commerce_wa_confirm_contact_email(tid, tok, 'q@example.com');
    q := public.commerce_wa_create_quote(tid, tok);
    v_results := v_results || jsonb_build_object('t','W09 quote needs a confirmed email; total is server-computed incl. courier',
      'ok', r->>'code' = 'email_required' and r2->>'code' = 'email_not_pending'
            and (q->>'total_cents')::bigint = 2*50000 + 9900 and q->'replaces' = 'null'::jsonb,
      'd', q::text);
    r := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, 100000);           -- wrong total
    perform public.commerce_wa_cart_set_item(tid, tok, 'W-B', 1);                             -- cart changes
    r2 := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
    q  := public.commerce_wa_create_quote(tid, tok);
    q2 := public.commerce_wa_create_quote(tid, tok);                                          -- supersedes q
    r3 := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
    v_results := v_results || jsonb_build_object('t','W10 wrong total, changed cart, superseded quote are all refused',
      'ok', r->>'code' = 'total_mismatch' and r2->>'code' = 'cart_changed' and r3->>'code' = 'quote_not_current'
            and not exists (select 1 from commerce.wa_checkout_intents where conversation_id = v_conv),
      'd', r::text || ' | ' || r2::text || ' | ' || r3::text);
    r  := public.commerce_wa_confirm_quote(tid, tok, (q2->>'quote_id')::uuid, (q2->>'total_cents')::bigint);
    r2 := public.commerce_wa_confirm_quote(tid, tok, (q2->>'quote_id')::uuid, (q2->>'total_cents')::bigint);
    v_results := v_results || jsonb_build_object('t','W11 replayed "yes" returns the same checkout — never a second one',
      'ok', (r->>'ok')::bool and (r2->>'replayed')::bool and r2->>'intent_id' = r->>'intent_id'
            and (select count(*) from commerce.wa_checkout_intents where conversation_id = v_conv) = 1
            and (select count(*) from commerce.wa_order_owners w join commerce.wa_checkout_intents i on i.order_id = w.order_id
                  where i.conversation_id = v_conv) = 1,
      'd', r2::text);
    v_int := (r->>'intent_id')::uuid;

    -- ── W12 checkout retries: persisted reference, ambiguity → reconcile first ─
    r  := public.commerce_wa_checkout_claim_init(v_int);
    r2 := public.commerce_wa_checkout_claim_init(v_int);                                       -- parallel retry
    v_ref := r->>'reference';
    r3 := public.commerce_wa_checkout_init_result(v_int, v_ref, (r->>'claim_token')::uuid, 'uncertain', 'timeout');
    t2 := public.commerce_wa_checkout_claim_init(v_int);
    v_ok := r->>'action' = 'initialize' and r2->>'action' = 'wait' and r3->>'status' = 'uncertain'
            and t2->>'action' = 'reconcile' and t2->>'reference' = v_ref;
    r  := public.commerce_wa_checkout_resolve(v_int, v_ref, false);                           -- Paystack: not found
    r2 := public.commerce_wa_checkout_claim_init(v_int);
    v_ok := v_ok and r->>'next' = 'initialize' and r->>'reference' = v_ref and r2->>'reference' = v_ref;
    perform public.commerce_wa_checkout_init_result(v_int, v_ref, (r2->>'claim_token')::uuid, 'uncertain', 'timeout again');
    r  := public.commerce_wa_checkout_resolve(v_int, v_ref, true, 'abandoned');               -- exists, URL never received
    v_ok := v_ok and r->>'reference' = regexp_replace(v_ref, '-1$', '-2')
            and (select status from commerce.payment_attempts where reference = v_ref) = 'cancelled';
    r2 := public.commerce_wa_checkout_claim_init(v_int);
    r3 := public.commerce_wa_checkout_attach(v_int, r2->>'reference', 'https://checkout.example/q2', 'ac_q2');
    t2 := public.commerce_wa_checkout_claim_init(v_int);
    v_results := v_results || jsonb_build_object('t','W12 retry recovers the SAME reference; ambiguous result must be reconciled before a new one',
      'ok', v_ok and (r3->>'ok')::bool and t2->>'action' = 'send_url' and t2->>'url' = 'https://checkout.example/q2'
            and (select count(*) from commerce.payment_attempts p join commerce.wa_checkout_intents i on i.order_id = p.order_id
                  where i.id = v_int) = 2,
      'd', t2::text);
    r := public.commerce_wa_complete_turn(tid, tok, jsonb_build_array(jsonb_build_object('purpose','checkout_link','intent_id',v_int)));
    v_results := v_results || jsonb_build_object('t','W13 checkout-link message is rendered from server records',
      'ok', (r->>'ok')::bool and (select payload->>'url' from commerce.wa_outbox where turn_id = tid and purpose = 'checkout_link') = 'https://checkout.example/q2'
            and (select (payload->>'total_cents')::bigint from commerce.wa_outbox where turn_id = tid and purpose = 'checkout_link') = 50000 + 9900,
      'd', r::text);

    -- ── W14 one open checkout per conversation (DB-enforced) ─────────────────
    v_ok := false; v_txt := null;
    r := public.commerce_create_order('zz-wa-suite', '{"email":"w14@example.com"}', '[{"sku":"W-A","qty":1}]', '{"method":"collect"}');
    insert into commerce.wa_checkout_quotes (store_id, conversation_id, cart_id, cart_revision, items, subtotal_cents,
           delivery_cents, total_cents, currency, status, expires_at)
    select store_id, conversation_id, cart_id, cart_revision, items, subtotal_cents, delivery_cents, total_cents, currency,
           'accepted', expires_at from commerce.wa_checkout_quotes where id = (q2->>'quote_id')::uuid
    returning id into v_int2;
    begin
      insert into commerce.wa_checkout_intents (store_id, conversation_id, identity_id, owner_ref, quote_id, order_id,
             payment_attempt_id, reference, total_cents, currency, email_snapshot, status)
      select store_id, conversation_id, identity_id, owner_ref, v_int2, (r->>'order_id')::uuid,
             payment_attempt_id, 'X', 1, 'ZAR', 'x@example.com', 'awaiting_url'
        from commerce.wa_checkout_intents where id = v_int;
    exception when unique_violation then
      get stacked diagnostics v_txt = constraint_name;
      v_ok := v_txt = 'wa_one_open_checkout_uq';
    end;
    v_results := v_results || jsonb_build_object('t','W14 a second open checkout for one conversation is impossible (unique index)',
      'ok', v_ok, 'd', coalesce(v_txt,'no violation'));

    -- ── W15 replacement: cancel old atomically, release holds, new intent ────
    m := commerce.wa_t_msg('27820000004', 'wamid.q2', 'add another');
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    perform public.commerce_wa_cart_set_item(tid, tok, 'W-B', 3);
    q := public.commerce_wa_create_quote(tid, tok);
    v_order := (select order_id from commerce.wa_checkout_intents where id = v_int);
    r := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
    v_int2 := (r->>'intent_id')::uuid;
    v_results := v_results || jsonb_build_object('t','W15 confirmed replacement cancels old checkout + releases holds in the same transaction',
      'ok', (r->>'ok')::bool and (q->'replaces'->>'intent_id')::uuid = v_int and (r->>'replaced_intent_id')::uuid = v_int
            and (select status from commerce.wa_checkout_intents where id = v_int) = 'cancelled'
            and (select status from commerce.orders where id = v_order) = 'cancelled'
            and not exists (select 1 from commerce.stock_reservations where order_id = v_order and status = 'active')
            and not exists (select 1 from commerce.payment_attempts where order_id = v_order and status in ('pending','unknown'))
            and (select superseded_by_intent_id from commerce.wa_checkout_intents where id = v_int) = v_int2
            and commerce.available_qty((select id from commerce.products where store_id = v_store and sku = 'W-B')) = 5 - 1 - 3,
      'd', r::text);

    -- ── W16 late payment on the cancelled link: money recorded, ONE owner exception,
    --        zero fulfilment, no customer paid confirmation; repeat event changes nothing.
    v_ref := (select reference from commerce.payment_attempts where order_id = v_order and attempt_no = 2);
    r  := public.commerce_apply_verified_payment(v_ref, 'success', 59900, 'ZAR', 'txn-late', 'webhook');
    r2 := public.commerce_apply_verified_payment(v_ref, 'success', 59900, 'ZAR', 'txn-late', 'reconcile');
    v_results := v_results || jsonb_build_object('t','W16 paid-after-cancel → funds recorded, 1 owner exception, 0 pack tasks, 0 paid messages',
      'ok', r->>'outcome' = 'paid_after_cancel' and r2->>'outcome' = 'duplicate'
            and (select status from commerce.payment_attempts where reference = v_ref) = 'succeeded'
            and (select count(*) from commerce.handoff_tasks where order_id = v_order and kind = 'paid_after_cancel') = 1
            and (select count(*) from commerce.handoff_tasks where order_id = v_order and kind = 'pack_order') = 0
            and (select count(*) from commerce.jobs where dedup_key = 'notify_paid:' || v_order) = 0
            and (select count(*) from commerce.wa_outbox where dedup_key = 'paid:' || v_order) = 0
            and (select status from commerce.wa_checkout_intents where id = v_int) = 'paid_after_cancel'
            and (select status from commerce.orders where id = v_order) = 'cancelled',
      'd', r::text || ' | ' || r2::text);

    -- ── W17 payment wins → replacement refused; old quote can't be replayed ──
    perform public.commerce_wa_checkout_attach(v_int2, (select reference from commerce.wa_checkout_intents where id = v_int2),
                                               'https://checkout.example/q3', 'ac_q3');
    perform public.commerce_wa_cart_set_item(tid, tok, 'W-A', 1);
    q := public.commerce_wa_create_quote(tid, tok);
    r := public.commerce_apply_verified_payment((select reference from commerce.wa_checkout_intents where id = v_int2),
                                                'success', 3*50000 + 9900, 'ZAR', 'txn-q3', 'webhook');
    r2 := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
    r3 := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
    v_results := v_results || jsonb_build_object('t','W17 payment first → replacement refused (no cancel), stale yes cannot retry it',
      'ok', r->>'outcome' = 'applied' and r2->>'code' in ('old_checkout_paid','checkout_changed')
            and r3->>'code' = 'quote_not_current'
            and (select status from commerce.wa_checkout_intents where id = v_int2) = 'paid'
            and (select count(*) from commerce.wa_checkout_intents where conversation_id = v_conv) = 2
            and (select count(*) from commerce.wa_outbox where conversation_id = v_conv and purpose = 'paid_confirmation') = 1
            and exists (select 1 from commerce.handoff_tasks where kind = 'pack_order'
                          and order_id = (select order_id from commerce.wa_checkout_intents where id = v_int2)),
      'd', r2::text);
    perform public.commerce_wa_complete_turn(tid, tok, '[]', 'no_reply');

    -- ── W18 replacement that can't be created rolls back completely ──────────
    A := commerce.wa_t_checkout('27820000005', 'W-LAST', 1, 'last@example.com', 'last1');
    v_conv := (A->>'conv')::uuid; v_int := (A->>'intent_id')::uuid;
    m := commerce.wa_t_msg('27820000005', 'wamid.last2', 'make it two');
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    perform public.commerce_wa_cart_set_item(tid, tok, 'W-LAST', 2);                   -- only 1 exists
    q := public.commerce_wa_create_quote(tid, tok);
    r := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
    v_results := v_results || jsonb_build_object('t','W18 replacement refused (stock) → old link still open, holds intact, nothing half-done',
      'ok', r->>'code' = 'insufficient_stock' and (r->>'previous_checkout_still_open')::bool
            and (select status from commerce.wa_checkout_intents where id = v_int) = 'open'
            and (select status from commerce.orders where id = (A->>'order_id')::uuid) = 'awaiting_payment'
            and exists (select 1 from commerce.stock_reservations where order_id = (A->>'order_id')::uuid and status = 'active')
            and (select status from commerce.wa_checkout_quotes where id = (q->>'quote_id')::uuid) = 'failed'
            and (select count(*) from commerce.wa_checkout_intents where conversation_id = v_conv) = 1,
      'd', r::text);

    -- ── W19 paused conversation: enumerated server actions only ──────────────
    r := public.commerce_wa_request_human(tid, tok, 'asked_for_person');
    r2 := public.commerce_wa_complete_turn(tid, tok, '[{"purpose":"reply","text":"ok"}]');
    m := commerce.wa_t_msg('27820000005', 'wamid.paused1', 'hello, anyone?', null);
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    v_txt := concat_ws(',',
      public.commerce_wa_cart_set_item(tid, tok, 'W-A', 1)->>'code',
      public.commerce_wa_create_quote(tid, tok)->>'code',
      public.commerce_wa_set_contact_email(tid, tok, 'x@example.com')->>'code',
      public.commerce_wa_reserve_model_spend(tid, tok, 1000)->>'code',
      public.commerce_wa_request_human(tid, tok, 'other')->>'code');
    r3 := public.commerce_wa_customer_orders(tid, tok, A->>'order_number');
    v_results := v_results || jsonb_build_object('t','W19 paused: server turn; only confirm_quote / order_status / complete allowed',
      'ok', (r->>'ok')::bool and (r2->>'dropped_replies')::int = 1 and t->>'kind' = 'server'
            and v_txt = 'action_not_allowed,action_not_allowed,action_not_allowed,action_not_allowed,action_not_allowed'
            and (r3->>'ok')::bool
            and public.commerce_wa_complete_turn(tid, tok, '[{"purpose":"reply","text":"AI text"}]')->>'code' = 'reply_not_allowed_in_server_turn'
            and (select count(*) from commerce.handoff_tasks where active_key = 'wa_handoff:' || v_conv and status = 'open') = 1,
      'd', v_txt || ' | ' || r2::text);
    perform public.commerce_wa_complete_turn(tid, tok, jsonb_build_array(jsonb_build_object('purpose','order_status',
      'order_numbers', jsonb_build_array(A->>'order_number'))), 'server_status');
    -- paid during takeover: fixed confirmation sent once, owner alerted, bot stays paused
    r := public.commerce_apply_verified_payment(A->>'reference', 'success', 85000, 'ZAR', 'txn-last', 'webhook');
    v_results := v_results || jsonb_build_object('t','W20 paid during takeover → one fixed confirmation + owner alert; still paused',
      'ok', r->>'outcome' = 'applied'
            and (select count(*) from commerce.wa_outbox where conversation_id = v_conv and purpose = 'paid_confirmation') = 1
            and exists (select 1 from commerce.handoff_tasks where kind = 'wa_paid_during_takeover' and order_id = (A->>'order_id')::uuid)
            and (select mode from commerce.wa_conversations where id = v_conv) = 'human_requested'
            and (select payload->>'order_number' from commerce.wa_outbox where turn_id = tid and purpose = 'order_status') is null
            and (select payload->'orders'->0->>'order_number' from commerce.wa_outbox where turn_id = tid and purpose = 'order_status') = A->>'order_number',
      'd', r::text);
    r := public.commerce_wa_owner_set_mode(v_conv, 'bot_active', 'owner:sanele@example.com');
    v_results := v_results || jsonb_build_object('t','W21 owner resume → bot_active, handoff task resolved',
      'ok', (r->>'ok')::bool and (select mode from commerce.wa_conversations where id = v_conv) = 'bot_active'
            and not exists (select 1 from commerce.handoff_tasks where active_key = 'wa_handoff:' || v_conv and status = 'open')
            and public.commerce_wa_owner_set_mode(v_conv, 'bot_active', 'whatsapp')->>'code' = 'owner_actor_required',
      'd', r::text);

    -- ── W22 model budget: atomic cap, Johannesburg day, exhausted → handoff ──
    insert into commerce.wa_settings (store_id, daily_model_cap_micro_usd) values (v_store, 2000000)
      on conflict (store_id) do update set daily_model_cap_micro_usd = 2000000;
    m := commerce.wa_t_msg('27820000006', 'wamid.budget', 'hi');
    v_conv := (m->>'conversation_id')::uuid;
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    r  := public.commerce_wa_reserve_model_spend(tid, tok, 900000);
    r2 := public.commerce_wa_reserve_model_spend(tid, tok, 900000);
    perform public.commerce_wa_settle_model_spend((r->>'reservation_id')::uuid, 1000000);   -- overran by 0.10
    r3 := public.commerce_wa_reserve_model_spend(tid, tok, 150000);                         -- 1.0 + 0.9 + 0.15 > 2.0
    v_results := v_results || jsonb_build_object('t','W22 budget reserved before calls; cap hit → paused, 1 task, 1 resting notice',
      'ok', (r->>'ok')::bool and (r2->>'ok')::bool and r3->>'code' = 'budget_exhausted'
            and (r->>'day')::date = (clock_timestamp() at time zone 'Africa/Johannesburg')::date
            and (select mode || ':' || pause_reason from commerce.wa_conversations where id = v_conv) = 'human_requested:budget'
            and (select count(*) from commerce.handoff_tasks where kind = 'wa_budget_exhausted' and store_id = v_store) = 1
            and (select count(*) from commerce.wa_outbox where conversation_id = v_conv and purpose = 'resting_notice') = 1
            and (select spent_micro_usd from commerce.wa_model_budget where store_id = v_store) = 1000000
            and (select reserved_micro_usd from commerce.wa_model_budget where store_id = v_store) = 900000,
      'd', r3::text);
    r := public.commerce_wa_complete_turn(tid, tok, '[{"purpose":"reply","text":"AI reply after pause"}]');
    v_results := v_results || jsonb_build_object('t','W23 owner takeover / pause mid-turn drops the AI reply',
      'ok', (r->>'dropped_replies')::int = 1 and (select count(*) from commerce.wa_outbox where turn_id = tid) = 0,
      'd', r::text);

    -- ── W24 crashed turn: its model reservation counts as spent ──────────────
    perform public.commerce_wa_owner_set_mode(v_conv, 'bot_active', 'owner:test');
    update commerce.wa_settings set daily_model_cap_micro_usd = 10000000 where store_id = v_store;
    update commerce.wa_model_budget set cap_micro_usd = 10000000 where store_id = v_store;
    perform commerce.wa_t_msg('27820000006', 'wamid.crash', 'hi again');
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    perform public.commerce_wa_reserve_model_spend(tid, tok, 300000);
    update commerce.wa_conversations set turn_lease_until = clock_timestamp() - interval '1 second' where id = v_conv;
    t2 := commerce.wa_t_turn(v_conv);
    v_results := v_results || jsonb_build_object('t','W24 abandoned turn''s reservation is counted as spent (cap stays honest)',
      'ok', (t2->>'claimed')::bool and (select spent_micro_usd from commerce.wa_model_budget where store_id = v_store) = 1300000
            and (select reserved_micro_usd from commerce.wa_model_budget where store_id = v_store) = 900000,
      'd', t2::text);
    perform public.commerce_wa_complete_turn((t2->>'turn_id')::uuid, (t2->>'lease_token')::uuid, '[]', 'no_reply');

    -- ── W25 poison message gives up after max attempts → human ───────────────
    m := commerce.wa_t_msg('27820000007', 'wamid.poison', 'boom');
    v_conv := (m->>'conversation_id')::uuid;
    for v_n in 1..3 loop
      t := commerce.wa_t_turn(v_conv);
      perform public.commerce_wa_release_turn((t->>'turn_id')::uuid, (t->>'lease_token')::uuid, 'model error');
    end loop;
    t := commerce.wa_t_turn(v_conv);
    v_results := v_results || jsonb_build_object('t','W25 a message that fails 3 turns is closed as gave_up and handed to a person',
      'ok', not (t->>'claimed')::bool
            and (select answer_outcome from commerce.wa_inbound where wa_message_id = 'wamid.poison') = 'gave_up'
            and (select mode from commerce.wa_conversations where id = v_conv) = 'human_requested',
      'd', t::text);

    -- ── W26 24h window at dispatch; lapsed send claim → uncertain, never resent ─
    update commerce.wa_outbox set status = 'cancelled' where store_id = v_store and status = 'queued'
       and conversation_id <> (A->>'conv')::uuid;
    update commerce.wa_conversations set last_inbound_at = clock_timestamp() - interval '25 hours' where id = (A->>'conv')::uuid;
    m := commerce.wa_t_msg('27820000008', 'wamid.win', 'hi');
    v_conv := (m->>'conversation_id')::uuid;
    v_id := commerce.wa_queue_out(v_conv, null, 'owner_reply', 'suite:w26', '{"type":"text","text":"hello"}');
    r := public.commerce_wa_claim_outbound(25, 30);
    v_results := v_results || jsonb_build_object('t','W26 outside 24h → window_closed + owner task; inside → claimed for send',
      'ok', not exists (select 1 from commerce.wa_outbox where conversation_id = (A->>'conv')::uuid and status in ('queued','sending'))
            and exists (select 1 from commerce.wa_outbox where conversation_id = (A->>'conv')::uuid and status = 'window_closed')
            and exists (select 1 from commerce.handoff_tasks where active_key = 'wa_window:' || (A->>'conv'))
            and exists (select 1 from jsonb_array_elements(r) x where (x->>'id')::bigint = v_id and x->>'to' = '27820000008'),
      'd', r::text);
    update commerce.wa_outbox set claim_until = clock_timestamp() - interval '1 second' where id = v_id;
    r := public.commerce_wa_claim_outbound(25, 30);
    r2 := public.commerce_wa_outbound_result(v_id, (select claim_token from commerce.wa_outbox where id = v_id), 'sent', 'wamid.out1');
    v_results := v_results || jsonb_build_object('t','W27 send whose claim lapsed → uncertain; not reclaimed; late result refused',
      'ok', (select status from commerce.wa_outbox where id = v_id) = 'uncertain'
            and not exists (select 1 from jsonb_array_elements(r) x where (x->>'id')::bigint = v_id)
            and r2->>'code' = 'not_claimed'
            and exists (select 1 from commerce.handoff_tasks where active_key = 'wa_uncertain:' || v_conv),
      'd', r::text);
    r := public.commerce_wa_outbound_resolve(v_id, 'requeue', 'owner:test');
    r2 := public.commerce_wa_claim_outbound(25, 30);
    r3 := public.commerce_wa_outbound_result(v_id, (select (x->>'claim_token')::uuid from jsonb_array_elements(r2) x
                                                       where (x->>'id')::bigint = v_id), 'sent', 'wamid.out1');
    perform public.commerce_wa_outbound_status('wamid.out1', 'read');
    perform public.commerce_wa_outbound_status('wamid.out1', 'delivered');           -- out of order: ignored
    v_results := v_results || jsonb_build_object('t','W28 explicit requeue → sent; status callbacks only move forward',
      'ok', (r->>'ok')::bool and (r3->>'ok')::bool and (select status from commerce.wa_outbox where id = v_id) = 'read',
      'd', r3::text);

    -- ── W29 retention purge: text gone, replay metadata kept, replay still deduped ─
    update commerce.wa_inbound set received_at = clock_timestamp() - interval '91 days' where wa_message_id = 'wamid.dup';
    update commerce.wa_outbox set created_at = clock_timestamp() - interval '91 days' where id = v_id;
    r := public.commerce_wa_purge_expired();
    r2 := commerce.wa_t_msg('27820000003', 'wamid.dup', 'first', null, clock_timestamp() - interval '92 days');
    v_results := v_results || jsonb_build_object('t','W29 90-day purge removes text/payloads, keeps ids; replay still ignored',
      'ok', (select body is null and redacted_at is not null from commerce.wa_inbound where wa_message_id = 'wamid.dup')
            and (select payload is null from commerce.wa_outbox where id = v_id)
            and not (r2->>'is_new')::bool
            and (select body from commerce.wa_inbound where wa_message_id = 'wamid.newer') is not null,
      'd', r::text);

    -- ── W32 quote that replaces a checkout which expired meanwhile → re-quote, nothing acted on ─
    A := commerce.wa_t_checkout('27820000009', 'W-B', 1, 'w32@example.com', 'w32');
    v_conv := (A->>'conv')::uuid;
    perform commerce.wa_t_msg('27820000009', 'wamid.w32b', 'change it');
    t := commerce.wa_t_turn(v_conv); tid := (t->>'turn_id')::uuid; tok := (t->>'lease_token')::uuid;
    perform public.commerce_wa_cart_set_item(tid, tok, 'W-B', 2);
    q := public.commerce_wa_create_quote(tid, tok);
    -- the hold lapses before a URL is ever sent → the intent is closed as expired
    update commerce.wa_checkout_intents set status = 'awaiting_url' where id = (A->>'intent_id')::uuid;
    update commerce.stock_reservations set expires_at = clock_timestamp() - interval '1 second' where order_id = (A->>'order_id')::uuid;
    r2 := public.commerce_wa_checkout_claim_init((A->>'intent_id')::uuid);
    r := public.commerce_wa_confirm_quote(tid, tok, (q->>'quote_id')::uuid, (q->>'total_cents')::bigint);
    v_results := v_results || jsonb_build_object('t','W32 quote for a checkout that has since closed → checkout_changed (re-quote)',
      'ok', r2->>'action' = 'expired' and r->>'code' = 'checkout_changed'
            and (select status from commerce.wa_checkout_quotes where id = (q->>'quote_id')::uuid) = 'stale'
            and (select count(*) from commerce.wa_checkout_intents where conversation_id = v_conv) = 1,
      'd', r::text || ' | claim: ' || t::text || ' | A: ' || (A->'confirm')::text);
    perform public.commerce_wa_complete_turn(tid, tok, '[]', 'no_reply');

    -- ── W30 M1 owner checkout cannot mint an untracked link for a WhatsApp order ─
    r := public.commerce_start_payment_attempt((select order_id from commerce.wa_checkout_intents where id = v_int2), 'owner:test');
    v_results := v_results || jsonb_build_object('t','W30 owner-page checkout refuses WhatsApp orders (managed_by_whatsapp)',
      'ok', r->>'code' = 'managed_by_whatsapp', 'd', r::text);

    -- ── W31 privileges: API functions are service_role only ──────────────────
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'commerce\_wa\_%';
    select count(*) into v_n2 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'commerce\_wa\_%'
       and not has_function_privilege('public', p.oid, 'execute')
       and (not exists (select 1 from pg_roles where rolname = 'anon') or not has_function_privilege('anon', p.oid, 'execute'))
       and (not exists (select 1 from pg_roles where rolname = 'service_role') or has_function_privilege('service_role', p.oid, 'execute'));
    v_results := v_results || jsonb_build_object('t','W31 every commerce_wa_* function: no public/anon execute, service_role yes',
      'ok', v_n > 20 and v_n = v_n2, 'd', v_n2 || '/' || v_n);

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

revoke all on function commerce.run_whatsapp_tests() from public;
revoke all on function commerce.wa_t_msg(text, text, text, text, timestamptz) from public;
revoke all on function commerce.wa_t_turn(uuid) from public;
revoke all on function commerce.wa_t_checkout(text, text, int, text, text) from public;
