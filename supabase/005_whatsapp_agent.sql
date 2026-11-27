-- ════════════════════════════════════════════════════════════════════════════
-- Inkanyezi Commerce — Milestone 2, step 2a: WhatsApp customer-agent database
-- File: supabase/005_whatsapp_agent.sql      Plan: docs/milestone-2-plan.md (v2)
--
-- Run AFTER 001 (and 002–004). Paste the WHOLE file into Supabase → SQL Editor → Run.
-- Safe to run once on a Milestone 1 database. It adds tables and functions; it does
-- not change or delete any Milestone 1 data. It replaces ONE Milestone 1 function
-- (commerce_start_payment_attempt) with an identical copy plus one extra guard.
--
-- What this adds (all in the private `commerce` schema, callable only via
-- service_role-only public.commerce_wa_* functions):
--   • Ownership:  every WhatsApp identity has an immutable owner_ref scoped to
--     store + receiving business number + verified sender. WhatsApp orders are
--     linked to that owner_ref (wa_order_owners, immutable). Status queries and paid
--     notifications use owner_ref — never the receipt email (two senders can share one).
--   • Turns:      inbound stored once (unique per business number + WA message id); the
--     unanswered row IS the schedule (committed in the same transaction). Turns claim
--     explicit message ids under a lease token; every write is fenced by that token;
--     reply intent + "answered" commit together. Bounded concurrency. Poison messages
--     give up after 3 attempts.
--   • Checkout:   quote (exact basket + total + which checkout it replaces) → customer
--     confirms THAT quote → one checkout intent with a persisted payment reference
--     BEFORE the provider is called. One open checkout per conversation, enforced by
--     a unique index (includes intents still waiting for a URL). Replacement is atomic
--     and serialised against payment application on the same order.
--   • Paused:     an enumerated allow-list of server-handled actions while a human has
--     the conversation; fixed paid confirmation still sent (once per order).
--   • Budget:     US$2/day model cap, reserved atomically BEFORE each model call; day =
--     midnight Africa/Johannesburg (setting).
--   • Outbox:     24-hour window checked at dispatch; timed-out sends become 'uncertain'
--     and are never resent without an explicit decision.
--   • Retention:  message text, media ids, outbox payloads, cart/quote addresses purged
--     after 90 days; replay metadata kept.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Settings (one row per store) ──────────────────────────────────────────

create table commerce.wa_settings (
  store_id                   uuid primary key references commerce.stores(id),
  daily_model_cap_micro_usd  bigint not null default 2000000 check (daily_model_cap_micro_usd >= 0),  -- US$2.00
  budget_timezone            text   not null default 'Africa/Johannesburg',   -- day resets at local midnight
  message_retention_days     integer not null default 90 check (message_retention_days between 1 and 365),
  quote_minutes              integer not null default 15 check (quote_minutes between 2 and 60),
  max_turn_attempts          integer not null default 3 check (max_turn_attempts between 1 and 10),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ─── Channels and identities ───────────────────────────────────────────────

-- One row per receiving WhatsApp business number (Meta "Phone Number ID").
create table commerce.wa_channels (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references commerce.stores(id),
  phone_number_id  text not null unique check (phone_number_id ~ '^[0-9]{5,25}$'),
  label            text,
  created_at       timestamptz not null default now()
);

-- One row per (business number, verified sender). wa_id comes from the signature-verified
-- webhook ONLY. owner_ref is the ownership key for orders — immutable (trigger below).
create table commerce.wa_identities (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references commerce.stores(id),
  channel_id          uuid not null references commerce.wa_channels(id),
  wa_id               text not null check (wa_id ~ '^[0-9]{6,20}$'),      -- PII (phone)
  owner_ref           uuid not null unique default gen_random_uuid(),
  display_name        text,                                               -- PII
  pending_email       text,                                               -- PII, awaiting read-back
  confirmed_email     text check (confirmed_email = lower(confirmed_email)),   -- PII, receipt email
  email_confirmed_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (channel_id, wa_id)
);

create table commerce.wa_conversations (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references commerce.stores(id),
  identity_id       uuid not null unique references commerce.wa_identities(id),
  mode              text not null default 'bot_active'
                    check (mode in ('bot_active','human_requested','human_active','closed')),
  pause_reason      text check (pause_reason in ('customer_request','budget','agent_failure','owner_takeover','gave_up')),
  last_inbound_at   timestamptz,                -- 24-hour customer-service window anchor
  owner_unread_since timestamptz,               -- inbound arrived while paused (2e shows it)
  current_turn_id   uuid,
  turn_lease_token  uuid,
  turn_lease_until  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index wa_conv_lease_idx on commerce.wa_conversations (turn_lease_until) where turn_lease_until is not null;

-- ─── Inbound messages (stored once) ────────────────────────────────────────

create table commerce.wa_inbound (
  id                bigserial primary key,
  store_id          uuid not null references commerce.stores(id),
  channel_id        uuid not null references commerce.wa_channels(id),
  conversation_id   uuid not null references commerce.wa_conversations(id),
  wa_message_id     text not null check (length(wa_message_id) between 4 and 200),
  wa_timestamp      timestamptz not null,
  kind              text not null check (kind in ('text','button','interactive','image','audio','video',
                                                  'document','sticker','location','contacts','reaction','unsupported')),
  body              text,                       -- PII — purged after retention days
  reply_id          text check (length(reply_id) <= 200),   -- id WE put on a button/list row (e.g. q:<uuid>) — not PII
  media_id          text,                       -- Meta media id — purged after retention days
  received_at       timestamptz not null default clock_timestamp(),
  turn_attempts     integer not null default 0,
  claimed_turn_id   uuid,
  answered_at       timestamptz,
  answered_turn_id  uuid,
  answer_outcome    text,
  redacted_at       timestamptz,
  unique (channel_id, wa_message_id)          -- replay metadata: kept after the body is purged
);
create index wa_inbound_unanswered_idx on commerce.wa_inbound (conversation_id, wa_timestamp, id) where answered_at is null;
create index wa_inbound_purge_idx on commerce.wa_inbound (received_at) where redacted_at is null;

create table commerce.wa_turns (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references commerce.stores(id),
  conversation_id  uuid not null references commerce.wa_conversations(id),
  kind             text not null check (kind in ('agent','server')),   -- server = model-free (paused conversations)
  lease_token      uuid not null,
  status           text not null default 'running' check (status in ('running','committed','abandoned')),
  message_ids      bigint[] not null,
  started_at       timestamptz not null default clock_timestamp(),
  lease_until      timestamptz not null,
  finished_at      timestamptz,
  outcome          text
);
create index wa_turns_conv_idx on commerce.wa_turns (conversation_id, started_at desc);
alter table commerce.wa_conversations add foreign key (current_turn_id) references commerce.wa_turns(id);

-- ─── Catalogue media + carts ───────────────────────────────────────────────

create table commerce.product_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references commerce.products(id),
  kind        text not null default 'image' check (kind = 'image'),
  url         text not null check (url ~ '^https://'),
  alt         text,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (product_id, sort)
);

create table commerce.wa_carts (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references commerce.stores(id),
  conversation_id  uuid not null references commerce.wa_conversations(id),
  status           text not null default 'active' check (status in ('active','ordered')),
  revision         integer not null default 0,
  delivery         jsonb,                     -- PII when courier (address) — purged after retention
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index wa_one_active_cart_uq on commerce.wa_carts (conversation_id) where status = 'active';

create table commerce.wa_cart_items (
  cart_id     uuid not null references commerce.wa_carts(id) on delete cascade,
  product_id  uuid not null references commerce.products(id),
  qty         integer not null check (qty between 1 and 10),
  primary key (cart_id, product_id)
);
-- Prices are NEVER stored in a cart. They are recomputed from products every time.

-- ─── Quotes, checkout intents, order ownership ─────────────────────────────

-- A quote freezes "this exact basket, this exact total, replacing THAT checkout (or none)".
-- The customer's "yes" confirms a quote id — so a stale/replayed yes can't act on anything else.
create table commerce.wa_checkout_quotes (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references commerce.stores(id),
  conversation_id       uuid not null references commerce.wa_conversations(id),
  cart_id               uuid not null references commerce.wa_carts(id),
  cart_revision         integer not null,
  items                 jsonb not null,      -- [{sku,name,qty,unit_price_cents,line_total_cents}]
  delivery              jsonb,               -- PII (address) — purged after retention
  subtotal_cents        bigint not null,
  delivery_cents        bigint not null,
  total_cents           bigint not null check (total_cents > 0),
  currency              char(3) not null,
  email_snapshot        text,                -- PII — purged after retention (the order keeps its own copy)
  replaces_intent_id    uuid,
  replaces_total_cents  bigint,
  status                text not null default 'offered'
                        check (status in ('offered','accepted','superseded','expired','stale','refused_paid','failed')),
  failure_code          text,
  intent_id             uuid,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default clock_timestamp(),
  decided_at            timestamptz,
  check (total_cents = subtotal_cents + delivery_cents)
);
create index wa_quotes_conv_idx on commerce.wa_checkout_quotes (conversation_id) where status = 'offered';

-- One checkout intent per accepted quote. The order AND the payment reference exist before
-- Paystack is called, so a retry recovers the same reference instead of minting a new one.
create table commerce.wa_checkout_intents (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references commerce.stores(id),
  conversation_id         uuid not null references commerce.wa_conversations(id),
  identity_id             uuid not null references commerce.wa_identities(id),
  owner_ref               uuid not null,
  quote_id                uuid not null unique references commerce.wa_checkout_quotes(id),
  order_id                uuid not null unique references commerce.orders(id),
  payment_attempt_id      uuid not null references commerce.payment_attempts(id),
  reference               text not null,
  total_cents             bigint not null,
  currency                char(3) not null,
  email_snapshot          text not null,     -- receipt email frozen for this checkout (order record, 5-year)
  status                  text not null default 'awaiting_url'
                          check (status in ('awaiting_url','open','uncertain','paid','cancelled','expired','paid_after_cancel')),
  init_claim_token        uuid,
  init_claim_until        timestamptz,
  last_error              text,
  superseded_by_intent_id uuid references commerce.wa_checkout_intents(id),
  created_at              timestamptz not null default clock_timestamp(),
  updated_at              timestamptz not null default clock_timestamp()
);
-- AT MOST ONE open checkout per conversation — including one still waiting for its URL.
create unique index wa_one_open_checkout_uq on commerce.wa_checkout_intents (conversation_id)
  where status in ('awaiting_url','open','uncertain');
alter table commerce.wa_checkout_quotes add foreign key (replaces_intent_id) references commerce.wa_checkout_intents(id);
alter table commerce.wa_checkout_quotes add foreign key (intent_id) references commerce.wa_checkout_intents(id);

-- Immutable owner of a WhatsApp-created order. Kept as long as the order (5 years).
create table commerce.wa_order_owners (
  order_id     uuid primary key references commerce.orders(id),
  store_id     uuid not null references commerce.stores(id),
  channel_id   uuid not null references commerce.wa_channels(id),
  identity_id  uuid not null references commerce.wa_identities(id),
  owner_ref    uuid not null,
  created_at   timestamptz not null default now()
);
create index wa_order_owners_ref_idx on commerce.wa_order_owners (owner_ref, created_at desc);

-- ─── Outbox (outbound WhatsApp messages) ───────────────────────────────────

create table commerce.wa_outbox (
  id                   bigserial primary key,
  store_id             uuid not null references commerce.stores(id),
  conversation_id      uuid not null references commerce.wa_conversations(id),
  turn_id              uuid references commerce.wa_turns(id),
  purpose              text not null check (purpose in ('reply','checkout_link','order_status','paid_confirmation',
                                                        'handoff_notice','resting_notice','owner_reply')),
  dedup_key            text not null unique,
  payload              jsonb,               -- PII — purged after retention days
  status               text not null default 'queued'
                       check (status in ('queued','sending','sent','delivered','read','failed','uncertain',
                                         'window_closed','cancelled')),
  claim_token          uuid,
  claim_until          timestamptz,
  attempts             integer not null default 0,
  provider_message_id  text unique,
  last_error           text,
  created_at           timestamptz not null default clock_timestamp(),
  updated_at           timestamptz not null default clock_timestamp(),
  sent_at              timestamptz,
  redacted_at          timestamptz
);
create index wa_outbox_queued_idx on commerce.wa_outbox (conversation_id, id) where status in ('queued','sending');

-- ─── Model budget (atomic reservations) ────────────────────────────────────

create table commerce.wa_model_budget (
  store_id            uuid not null references commerce.stores(id),
  day                 date not null,          -- local day in wa_settings.budget_timezone
  cap_micro_usd       bigint not null,
  reserved_micro_usd  bigint not null default 0 check (reserved_micro_usd >= 0),
  spent_micro_usd     bigint not null default 0 check (spent_micro_usd >= 0),
  exhausted_at        timestamptz,
  primary key (store_id, day)
);

create table commerce.wa_model_reservations (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references commerce.stores(id),
  day                date not null,
  turn_id            uuid not null references commerce.wa_turns(id),
  amount_micro_usd   bigint not null check (amount_micro_usd > 0),
  actual_micro_usd   bigint,
  status             text not null default 'reserved' check (status in ('reserved','settled')),
  created_at         timestamptz not null default clock_timestamp()
);
create index wa_model_res_turn_idx on commerce.wa_model_reservations (turn_id) where status = 'reserved';

-- ─── Immutability triggers ─────────────────────────────────────────────────

create function commerce.wa_identity_immutable() returns trigger
language plpgsql set search_path = commerce, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from wa_channels c where c.id = new.channel_id and c.store_id = new.store_id) then
      raise exception 'wa identity store must match its channel store';
    end if;
    return new;
  end if;
  if new.owner_ref is distinct from old.owner_ref or new.store_id is distinct from old.store_id
     or new.channel_id is distinct from old.channel_id or new.wa_id is distinct from old.wa_id then
    raise exception 'wa identity owner_ref/store/channel/wa_id are immutable';
  end if;
  return new;
end $$;
create trigger wa_identity_immutable before insert or update on commerce.wa_identities
  for each row execute function commerce.wa_identity_immutable();

create function commerce.wa_order_owner_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'wa_order_owners rows are immutable (% refused)', tg_op;
end $$;
create trigger wa_order_owner_immutable before update or delete on commerce.wa_order_owners
  for each row execute function commerce.wa_order_owner_immutable();

create function commerce.wa_intent_immutable() returns trigger
language plpgsql as $$
begin
  if new.owner_ref is distinct from old.owner_ref or new.order_id is distinct from old.order_id
     or new.conversation_id is distinct from old.conversation_id or new.identity_id is distinct from old.identity_id
     or new.quote_id is distinct from old.quote_id or new.email_snapshot is distinct from old.email_snapshot
     or new.total_cents is distinct from old.total_cents then
    raise exception 'wa checkout intent ownership/amount fields are immutable';
  end if;
  return new;
end $$;
create trigger wa_intent_immutable before update on commerce.wa_checkout_intents
  for each row execute function commerce.wa_intent_immutable();

-- ─── Internal helpers ──────────────────────────────────────────────────────

create function commerce.wa_settings_for(p_store uuid) returns commerce.wa_settings
language plpgsql set search_path = commerce, pg_temp as $$
declare v wa_settings;
begin
  insert into wa_settings (store_id) values (p_store) on conflict (store_id) do nothing;
  select * into v from wa_settings where store_id = p_store;
  return v;
end $$;

-- Fence for every write made during a turn. Locks the conversation row (NO KEY UPDATE, so
-- inserts that merely reference the conversation — e.g. the paid-confirmation trigger
-- inside a payment transaction — are never blocked by it, which rules out a deadlock).
-- Returns NULL when allowed, else an error code.
-- ENUMERATED server-handled actions (model-free) — the ONLY ones allowed while paused:
--   confirm_quote (customer taps "Yes, pay R…" on a quote shown before the pause),
--   order_status (own orders, fixed template), complete (finish the turn).
-- Paid confirmation is not a turn action: it is written by the payment transaction itself.
create function commerce.wa_turn_guard(p_turn_id uuid, p_token uuid, p_action text) returns text
language plpgsql set search_path = commerce, pg_temp as $$
declare v_turn wa_turns; v_conv wa_conversations;
begin
  select * into v_turn from wa_turns where id = p_turn_id;
  if not found or v_turn.lease_token is distinct from p_token then return 'lease_lost'; end if;
  select * into v_conv from wa_conversations where id = v_turn.conversation_id for no key update;
  if v_turn.status <> 'running' or v_conv.current_turn_id is distinct from v_turn.id
     or v_conv.turn_lease_token is distinct from p_token
     or v_conv.turn_lease_until is null or v_conv.turn_lease_until <= clock_timestamp() then
    return 'lease_lost';
  end if;
  if v_turn.kind = 'server' and p_action not in ('confirm_quote','order_status','complete') then
    return 'action_not_allowed';
  end if;
  if v_turn.kind = 'agent' and v_conv.mode <> 'bot_active' and p_action not in ('complete') then
    return 'paused';
  end if;
  return null;
end $$;

-- Server-side pricing for a cart, using the same rules as commerce_create_order.
-- (commerce_create_order re-checks the confirmed total, so any drift is refused, never charged.)
create function commerce.wa_price_cart(p_cart_id uuid) returns jsonb
language plpgsql set search_path = commerce, pg_temp as $$
declare
  v_cart wa_carts; v_store stores; v_items jsonb; v_sub bigint; v_del bigint := 0; v_bad jsonb;
begin
  select * into v_cart from wa_carts where id = p_cart_id;
  select * into v_store from stores where id = v_cart.store_id;
  select coalesce(jsonb_agg(jsonb_build_object('sku',p.sku,'name',p.name,'qty',ci.qty,
            'unit_price_cents',p.price_cents,'line_total_cents',p.price_cents*ci.qty,
            'availability', case when not p.active then 'unavailable'
                                 when available_qty(p.id) <= 0 then 'sold_out'
                                 when available_qty(p.id) < ci.qty then 'not_enough'
                                 when available_qty(p.id) <= 2 then 'low' else 'in_stock' end) order by p.sku), '[]'),
         coalesce(sum(p.price_cents*ci.qty), 0),
         coalesce(jsonb_agg(p.sku) filter (where not p.active or p.currency <> v_store.currency), '[]')
    into v_items, v_sub, v_bad
    from wa_cart_items ci join products p on p.id = ci.product_id where ci.cart_id = p_cart_id;
  if jsonb_array_length(v_items) = 0 then return jsonb_build_object('ok',false,'code','cart_empty','revision',v_cart.revision); end if;
  if jsonb_array_length(v_bad) > 0 then
    return jsonb_build_object('ok',false,'code','unknown_or_inactive_sku','skus',v_bad,'revision',v_cart.revision);
  end if;
  if v_cart.delivery is null then
    return jsonb_build_object('ok',false,'code','delivery_not_set','items',v_items,'subtotal_cents',v_sub,'revision',v_cart.revision);
  end if;
  if v_cart.delivery->>'method' = 'courier' then
    if v_store.flat_delivery_cents is null then
      return jsonb_build_object('ok',false,'code','delivery_not_priced','items',v_items,'subtotal_cents',v_sub,'revision',v_cart.revision);
    end if;
    v_del := v_store.flat_delivery_cents;
  end if;
  return jsonb_build_object('ok',true,'items',v_items,'subtotal_cents',v_sub,'delivery_cents',v_del,
                            'total_cents',v_sub+v_del,'currency',v_store.currency,'delivery',v_cart.delivery,
                            'revision',v_cart.revision);
end $$;

create function commerce.wa_active_cart(p_conv uuid) returns commerce.wa_carts
language plpgsql set search_path = commerce, pg_temp as $$
declare v wa_carts;
begin
  select * into v from wa_carts where conversation_id = p_conv and status = 'active';
  if not found then
    insert into wa_carts (store_id, conversation_id)
    select store_id, id from wa_conversations where id = p_conv returning * into v;
  end if;
  return v;
end $$;

create function commerce.wa_queue_out(p_conv uuid, p_turn uuid, p_purpose text, p_dedup text, p_payload jsonb)
returns bigint language plpgsql set search_path = commerce, pg_temp as $$
declare v_id bigint;
begin
  insert into wa_outbox (store_id, conversation_id, turn_id, purpose, dedup_key, payload)
  select c.store_id, c.id, p_turn, p_purpose, p_dedup, p_payload from wa_conversations c where c.id = p_conv
  on conflict (dedup_key) do nothing returning id into v_id;
  return v_id;
end $$;

-- Pause a conversation for a human (idempotent; one active task per conversation).
create function commerce.wa_pause(p_conv uuid, p_reason text, p_detail text) returns void
language plpgsql set search_path = commerce, pg_temp as $$
declare v_conv wa_conversations;
begin
  update wa_conversations set mode = 'human_requested', pause_reason = p_reason, updated_at = now()
   where id = p_conv and mode = 'bot_active' returning * into v_conv;
  if not found then select * into v_conv from wa_conversations where id = p_conv; end if;
  perform open_task(v_conv.store_id, null, 'wa_handoff', 'support', 'high',
    'WhatsApp customer needs a person (' || p_reason || ')', 'wa_handoff:' || p_conv,
    jsonb_build_object('conversation_id', p_conv, 'reason', p_reason, 'detail', left(coalesce(p_detail,''), 120)));
  perform audit(v_conv.store_id, 'wa_conversation', p_conv, 'paused', 'system', 'bot_active', 'human_requested',
                jsonb_build_object('reason', p_reason));
end $$;

-- Cancel an unpaid WhatsApp checkout: release holds, cancel attempts (references kept so a
-- late payment still matches), cancel the order. Caller must hold: attempts → order → intent locks.
create function commerce.wa_cancel_checkout(p_intent uuid, p_new_status text, p_actor text) returns void
language plpgsql set search_path = commerce, pg_temp as $$
declare v_int wa_checkout_intents;
begin
  select * into v_int from wa_checkout_intents where id = p_intent;
  update stock_reservations set status = 'released', updated_at = now()
   where order_id = v_int.order_id and status = 'active';
  update payment_attempts set status = 'cancelled', updated_at = now()
   where order_id = v_int.order_id and status in ('pending','unknown');
  update orders set status = 'cancelled', updated_at = now()
   where id = v_int.order_id and status = 'awaiting_payment';
  update wa_checkout_intents set status = p_new_status, init_claim_token = null, init_claim_until = null,
         updated_at = clock_timestamp() where id = p_intent;
  perform audit(v_int.store_id, 'order', v_int.order_id, 'cancelled', p_actor, 'awaiting_payment', 'cancelled',
                jsonb_build_object('intent_id', p_intent, 'reason', p_new_status));
end $$;

-- ═══ Public API (service_role only) ════════════════════════════════════════

-- 1) Inbound: store once + schedule, in ONE transaction. The unanswered row is the schedule,
--    so a crash after commit can never lose the turn. Duplicates/replays change nothing.
create function public.commerce_wa_record_inbound(
  p_phone_number_id text, p_wa_id text, p_wa_message_id text, p_wa_timestamp timestamptz,
  p_kind text, p_body text default null, p_reply_id text default null, p_media_id text default null,
  p_profile_name text default null
) returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_chan wa_channels; v_ident wa_identities; v_conv wa_conversations; v_id bigint; v_kind text;
begin
  select * into v_chan from wa_channels where phone_number_id = p_phone_number_id;
  if not found then return jsonb_build_object('ok',false,'code','unknown_channel'); end if;
  perform wa_settings_for(v_chan.store_id);                        -- retention/budget settings always exist
  if coalesce(p_wa_id,'') !~ '^[0-9]{6,20}$' then return jsonb_build_object('ok',false,'code','invalid_sender'); end if;
  v_kind := case when p_kind in ('text','button','interactive','image','audio','video','document','sticker',
                                 'location','contacts','reaction') then p_kind else 'unsupported' end;

  insert into wa_identities (store_id, channel_id, wa_id, display_name)
  values (v_chan.store_id, v_chan.id, p_wa_id, left(nullif(p_profile_name,''), 80))
  on conflict (channel_id, wa_id) do update set display_name = coalesce(excluded.display_name, wa_identities.display_name),
                                                updated_at = now()
  returning * into v_ident;

  insert into wa_conversations (store_id, identity_id) values (v_chan.store_id, v_ident.id)
  on conflict (identity_id) do nothing;
  select * into v_conv from wa_conversations where identity_id = v_ident.id;

  insert into wa_inbound (store_id, channel_id, conversation_id, wa_message_id, wa_timestamp, kind, body, reply_id, media_id)
  values (v_chan.store_id, v_chan.id, v_conv.id, p_wa_message_id, p_wa_timestamp, v_kind,
          left(p_body, 4096), left(p_reply_id, 200), left(p_media_id, 200))
  on conflict (channel_id, wa_message_id) do nothing returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok',true,'is_new',false,'conversation_id',v_conv.id,'mode',v_conv.mode);
  end if;

  -- 24h window anchor: never move it backwards (late redelivery) or into the future (clock skew).
  update wa_conversations
     set last_inbound_at = greatest(coalesce(last_inbound_at, '-infinity'), least(p_wa_timestamp, clock_timestamp())),
         owner_unread_since = case when mode <> 'bot_active' then coalesce(owner_unread_since, clock_timestamp())
                                   else owner_unread_since end,
         updated_at = now()
   where id = v_conv.id;
  return jsonb_build_object('ok',true,'is_new',true,'inbound_id',v_id,'conversation_id',v_conv.id,'mode',v_conv.mode);
end $$;

-- 2) Claim a turn. Separate from the Milestone 1 worker plan (own route/schedule, 2b+).
--    • Bounded: at most p_max_concurrent live leases across the store (DB concurrency cap).
--    • Explicit: the turn records exactly which inbound ids it owns (max 20, oldest first).
--    • Recovery: an expired lease's turn is marked abandoned; its messages are re-claimed;
--      its model reservations are counted as spent (it may have called the model).
--    • Poison: messages already tried max_turn_attempts times are closed as 'gave_up' and the
--      conversation goes to a human.
--    • kind = 'agent' when bot_active, 'server' when paused (model-free allow-list only).
create function public.commerce_wa_claim_turn(p_conversation_id uuid default null, p_lease_seconds int default 60,
                                              p_max_concurrent int default 3)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_conv wa_conversations; v_set wa_settings; v_token uuid := gen_random_uuid(); v_turn uuid;
  v_ids bigint[]; v_live int; v_gave_up int; v_kind text; v_lease int;
begin
  perform pg_advisory_xact_lock(hashtext('commerce_wa_claim_turn'));    -- serialises the concurrency count
  select count(*) into v_live from wa_conversations where turn_lease_until > clock_timestamp();
  if v_live >= greatest(1, least(coalesce(p_max_concurrent, 3), 20)) then
    return jsonb_build_object('claimed',false,'reason','concurrency_limit');
  end if;

  select c.* into v_conv from wa_conversations c
   where (p_conversation_id is null or c.id = p_conversation_id)
     and c.mode <> 'closed'
     and (c.turn_lease_until is null or c.turn_lease_until <= clock_timestamp())
     and exists (select 1 from wa_inbound i where i.conversation_id = c.id and i.answered_at is null)
   order by (select min(i.received_at) from wa_inbound i where i.conversation_id = c.id and i.answered_at is null), c.id
   limit 1
   for no key update skip locked;
  if not found then return jsonb_build_object('claimed',false,'reason','nothing_due'); end if;

  -- Abandon the previous turn if its lease ran out (crashed / timed-out worker).
  if v_conv.current_turn_id is not null then
    update wa_turns set status = 'abandoned', finished_at = clock_timestamp(), outcome = 'lease_expired'
     where id = v_conv.current_turn_id and status = 'running';

    -- Late settlement locks the reservation before the budget. Lock every remaining
    -- reservation before touching any budget row, including when a turn crosses midnight.
    perform 1 from wa_model_reservations r
     where r.turn_id = v_conv.current_turn_id and r.status = 'reserved'
     order by r.id for update;
    update wa_model_budget b set reserved_micro_usd = b.reserved_micro_usd - pending.total_micro_usd,
                                 spent_micro_usd = b.spent_micro_usd + pending.total_micro_usd
      from (
        select store_id, day, sum(amount_micro_usd)::bigint as total_micro_usd
          from wa_model_reservations
         where turn_id = v_conv.current_turn_id and status = 'reserved'
         group by store_id, day
      ) pending
     where b.store_id = pending.store_id and b.day = pending.day;
    update wa_model_reservations set status = 'settled', actual_micro_usd = amount_micro_usd
     where turn_id = v_conv.current_turn_id and status = 'reserved';
  end if;

  v_set := wa_settings_for(v_conv.store_id);
  update wa_inbound set answered_at = clock_timestamp(), answer_outcome = 'gave_up'
   where conversation_id = v_conv.id and answered_at is null and turn_attempts >= v_set.max_turn_attempts;
  get diagnostics v_gave_up = row_count;
  if v_gave_up > 0 then
    perform wa_pause(v_conv.id, 'gave_up', v_gave_up || ' message(s) failed ' || v_set.max_turn_attempts || ' turns');
    select * into v_conv from wa_conversations where id = v_conv.id;
  end if;

  select array_agg(id order by wa_timestamp, id) into v_ids from (
    select id, wa_timestamp from wa_inbound where conversation_id = v_conv.id and answered_at is null
     order by wa_timestamp, id limit 20) s;
  if v_ids is null then return jsonb_build_object('claimed',false,'reason','nothing_due','gave_up',v_gave_up); end if;

  v_kind  := case when v_conv.mode = 'bot_active' then 'agent' else 'server' end;
  v_lease := greatest(10, least(coalesce(p_lease_seconds, 60), 300));
  insert into wa_turns (store_id, conversation_id, kind, lease_token, message_ids, lease_until)
  values (v_conv.store_id, v_conv.id, v_kind, v_token, v_ids, clock_timestamp() + make_interval(secs => v_lease))
  returning id into v_turn;
  update wa_inbound set claimed_turn_id = v_turn, turn_attempts = turn_attempts + 1 where id = any(v_ids);
  update wa_conversations set current_turn_id = v_turn, turn_lease_token = v_token,
         turn_lease_until = clock_timestamp() + make_interval(secs => v_lease), updated_at = now()
   where id = v_conv.id;

  return jsonb_build_object('claimed',true,'turn_id',v_turn,'lease_token',v_token,'conversation_id',v_conv.id,
                            'kind',v_kind,'mode',v_conv.mode,'message_ids',to_jsonb(v_ids),'gave_up',v_gave_up);
end $$;

-- Messages a turn owns (bodies for the model; reply ids for buttons). Fenced read.
create function public.commerce_wa_turn_messages(p_turn_id uuid, p_lease_token uuid)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'complete');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  return jsonb_build_object('ok',true,'messages',(
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'body',i.body,'reply_id',i.reply_id,
                    'has_media',i.media_id is not null,'wa_timestamp',i.wa_timestamp) order by i.wa_timestamp, i.id), '[]')
      from wa_inbound i join wa_turns t on i.id = any(t.message_ids) where t.id = p_turn_id));
end $$;

-- 3) Commit a turn: reply intent + "answered" + lease release in ONE transaction, fenced by the
--    lease token. A turn whose lease expired commits nothing. Only the turn's OWN claimed
--    message ids are marked answered (newer inbound waits for the next turn).
--    p_replies: [{purpose:'reply', text} | {purpose:'checkout_link', intent_id} |
--                {purpose:'order_status', order_numbers:[...]} | {purpose:'handoff_notice'}]
--    Prices/totals/URLs/order states in checkout_link + order_status are RENDERED HERE from
--    server records — the caller cannot supply them. Free-form 'reply' is agent-only, and is
--    dropped if the conversation was paused mid-turn (owner took over).
create function public.commerce_wa_complete_turn(p_turn_id uuid, p_lease_token uuid,
                                                 p_replies jsonb default '[]', p_outcome text default 'replied')
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_err text; v_turn wa_turns; v_conv wa_conversations; v_ident wa_identities; r jsonb; v_n int := 0;
  v_ids bigint[] := '{}'; v_id bigint; v_int wa_checkout_intents; v_payload jsonb; v_dropped int := 0;
  v_order orders; v_left int; v_staged jsonb[] := '{}';
begin
  select * into v_turn from wa_turns where id = p_turn_id;
  if found and v_turn.status = 'committed' and v_turn.lease_token = p_lease_token then
    return jsonb_build_object('ok',true,'replayed',true);          -- retry after an ambiguous DB timeout
  end if;
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'complete');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  select * into v_conv from wa_conversations where id = v_turn.conversation_id;
  select * into v_ident from wa_identities where id = v_conv.identity_id;
  if jsonb_typeof(coalesce(p_replies,'[]')) <> 'array' or jsonb_array_length(coalesce(p_replies,'[]')) > 5 then
    return jsonb_build_object('ok',false,'code','invalid_replies');
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_replies,'[]')) loop
    v_n := v_n + 1; v_payload := null;
    if r->>'purpose' = 'reply' then
      if v_turn.kind <> 'agent' then return jsonb_build_object('ok',false,'code','reply_not_allowed_in_server_turn'); end if;
      if coalesce(r->>'text','') = '' or length(r->>'text') > 4096 then return jsonb_build_object('ok',false,'code','invalid_reply_text'); end if;
      if v_conv.mode <> 'bot_active' then v_dropped := v_dropped + 1; continue; end if;
      v_payload := jsonb_build_object('type','text','text',r->>'text');
    elsif r->>'purpose' = 'checkout_link' then
      select * into v_int from wa_checkout_intents where id = (r->>'intent_id')::uuid and conversation_id = v_conv.id;
      if not found or v_int.status <> 'open' then return jsonb_build_object('ok',false,'code','checkout_not_open'); end if;
      select * into v_order from orders where id = v_int.order_id;
      v_payload := jsonb_build_object('type','template','template','checkout_link','order_number',v_order.order_number,
                     'total_cents',v_int.total_cents,'currency',v_int.currency,
                     'url',(select authorization_url from payment_attempts where id = v_int.payment_attempt_id),
                     'hold_expires_at',v_order.reservation_expires_at);
    elsif r->>'purpose' = 'order_status' then
      v_payload := jsonb_build_object('type','template','template','order_status','orders',(
        select coalesce(jsonb_agg(jsonb_build_object('order_number',o.order_number,'status',o.status,
                 'fulfilment_status',o.fulfilment_status,'total_cents',o.total_cents,'currency',o.currency,
                 'paid_at',o.paid_at) order by o.created_at desc), '[]')
          from wa_order_owners w join orders o on o.id = w.order_id
         where w.owner_ref = v_ident.owner_ref
           and o.order_number in (select jsonb_array_elements_text(coalesce(r->'order_numbers','[]'))) ));
    elsif r->>'purpose' = 'handoff_notice' then
      if v_turn.kind <> 'agent' then return jsonb_build_object('ok',false,'code','reply_not_allowed_in_server_turn'); end if;
      v_payload := jsonb_build_object('type','template','template','handoff_notice');
    else
      return jsonb_build_object('ok',false,'code','invalid_purpose');
    end if;
    v_staged := array_append(v_staged, jsonb_build_object(
      'purpose', r->>'purpose', 'dedup_key', 'turn:' || p_turn_id || ':' || v_n, 'payload', v_payload));
  end loop;

  -- Validation errors return normally. Queue only after the whole batch has passed.
  foreach r in array v_staged loop
    v_id := wa_queue_out(v_conv.id, p_turn_id, r->>'purpose', r->>'dedup_key', r->'payload');
    if v_id is not null then v_ids := v_ids || v_id; end if;
  end loop;

  update wa_inbound set answered_at = clock_timestamp(), answered_turn_id = p_turn_id,
         answer_outcome = case when v_dropped > 0 then 'paused_discarded' else left(coalesce(p_outcome,'replied'), 40) end
   where id = any(v_turn.message_ids) and answered_at is null;
  update wa_turns set status = 'committed', finished_at = clock_timestamp(),
         outcome = case when v_dropped > 0 then 'paused_discarded' else left(coalesce(p_outcome,'replied'), 40) end
   where id = p_turn_id;
  update wa_conversations set current_turn_id = null, turn_lease_token = null, turn_lease_until = null, updated_at = now()
   where id = v_conv.id;
  select count(*) into v_left from wa_inbound where conversation_id = v_conv.id and answered_at is null;
  return jsonb_build_object('ok',true,'replayed',false,'outbox_ids',to_jsonb(v_ids),'dropped_replies',v_dropped,
                            'unanswered_remaining',v_left);
end $$;

-- Give up a turn without replying (error path). Messages stay unanswered and are retried
-- by the next claim (bounded by max_turn_attempts).
create function public.commerce_wa_release_turn(p_turn_id uuid, p_lease_token uuid, p_error text default null)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_turn wa_turns;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'complete');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  select * into v_turn from wa_turns where id = p_turn_id;
  update wa_turns set status = 'abandoned', finished_at = clock_timestamp(), outcome = left(coalesce(p_error,'released'), 80)
   where id = p_turn_id;
  update wa_conversations set current_turn_id = null, turn_lease_token = null, turn_lease_until = null, updated_at = now()
   where id = v_turn.conversation_id;
  return jsonb_build_object('ok',true);
end $$;

-- 4) Cart tools (agent turns only). Every change bumps the revision, which makes any quote
--    for an older revision stale.
create function public.commerce_wa_cart_set_item(p_turn_id uuid, p_lease_token uuid, p_sku text, p_qty int)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_turn wa_turns; v_cart wa_carts; v_prod products;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'cart');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  if p_qty is null or p_qty not between 0 and 10 then return jsonb_build_object('ok',false,'code','invalid_quantity'); end if;
  select * into v_turn from wa_turns where id = p_turn_id;
  v_cart := wa_active_cart(v_turn.conversation_id);
  select * into v_prod from products where store_id = v_cart.store_id and sku = upper(trim(p_sku)) and active;
  if not found then return jsonb_build_object('ok',false,'code','unknown_or_inactive_sku'); end if;
  if p_qty = 0 then
    delete from wa_cart_items where cart_id = v_cart.id and product_id = v_prod.id;
  else
    insert into wa_cart_items (cart_id, product_id, qty) values (v_cart.id, v_prod.id, p_qty)
    on conflict (cart_id, product_id) do update set qty = excluded.qty;
  end if;
  update wa_carts set revision = revision + 1, updated_at = now() where id = v_cart.id;
  return public.commerce_wa_cart_view(v_turn.conversation_id);
end $$;

create function public.commerce_wa_cart_set_delivery(p_turn_id uuid, p_lease_token uuid, p_delivery jsonb)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_turn wa_turns; v_cart wa_carts; v_d jsonb;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'cart');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  if p_delivery->>'method' = 'collect' then
    v_d := jsonb_build_object('method','collect');
  elsif p_delivery->>'method' = 'courier' then
    if coalesce(trim(p_delivery->>'line1'),'') = '' or coalesce(trim(p_delivery->>'city'),'') = ''
       or coalesce(trim(p_delivery->>'postal_code'),'') !~ '^[0-9]{4}$' then
      return jsonb_build_object('ok',false,'code','incomplete_address');
    end if;
    v_d := jsonb_build_object('method','courier','line1',left(trim(p_delivery->>'line1'),120),
             'line2',left(nullif(trim(p_delivery->>'line2'),''),120),'suburb',left(nullif(trim(p_delivery->>'suburb'),''),80),
             'city',left(trim(p_delivery->>'city'),80),'postal_code',trim(p_delivery->>'postal_code'));
  else
    return jsonb_build_object('ok',false,'code','invalid_delivery_method');
  end if;
  select * into v_turn from wa_turns where id = p_turn_id;
  v_cart := wa_active_cart(v_turn.conversation_id);
  update wa_carts set delivery = v_d, revision = revision + 1, updated_at = now() where id = v_cart.id;
  return public.commerce_wa_cart_view(v_turn.conversation_id);
end $$;

-- Read-only: server-computed basket. Also says whether an unpaid link already exists.
create function public.commerce_wa_cart_view(p_conversation_id uuid)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_cart wa_carts; v_price jsonb; v_open wa_checkout_intents;
begin
  select * into v_cart from wa_carts where conversation_id = p_conversation_id and status = 'active';
  select * into v_open from wa_checkout_intents
   where conversation_id = p_conversation_id and status in ('awaiting_url','open','uncertain');
  if v_cart.id is null then
    v_price := jsonb_build_object('ok',false,'code','cart_empty','revision',0);
  else
    v_price := wa_price_cart(v_cart.id);
  end if;
  return v_price || jsonb_build_object('cart_revision', coalesce(v_cart.revision,0),
    'open_checkout', case when v_open.id is null then null else
      jsonb_build_object('intent_id',v_open.id,'total_cents',v_open.total_cents,'status',v_open.status) end);
end $$;

-- 5) Receipt email (decision 1): format-checked, read back, then confirmed. No OTP in M2.
create function public.commerce_wa_set_contact_email(p_turn_id uuid, p_lease_token uuid, p_email text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_email text := lower(trim(p_email));
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'email');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok',false,'code','invalid_email');
  end if;
  update wa_identities set pending_email = v_email, updated_at = now()
   where id = (select c.identity_id from wa_conversations c join wa_turns t on t.conversation_id = c.id where t.id = p_turn_id);
  return jsonb_build_object('ok',true,'email_to_read_back',v_email);
end $$;

create function public.commerce_wa_confirm_contact_email(p_turn_id uuid, p_lease_token uuid, p_email text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_n int;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'email');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  update wa_identities set confirmed_email = pending_email, email_confirmed_at = clock_timestamp(),
         pending_email = null, updated_at = now()
   where id = (select c.identity_id from wa_conversations c join wa_turns t on t.conversation_id = c.id where t.id = p_turn_id)
     and pending_email is not null and pending_email = lower(trim(p_email));
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok',false,'code','email_not_pending'); end if;
  return jsonb_build_object('ok',true);
end $$;

-- 6) Quote: freeze basket + total + "replaces checkout X (R…)". Supersedes older offers.
create function public.commerce_wa_create_quote(p_turn_id uuid, p_lease_token uuid)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_err text; v_turn wa_turns; v_conv wa_conversations; v_ident wa_identities; v_cart wa_carts;
  v_price jsonb; v_open wa_checkout_intents; v_set wa_settings; v_q uuid; v_exp timestamptz;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'quote');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  select * into v_turn from wa_turns where id = p_turn_id;
  select * into v_conv from wa_conversations where id = v_turn.conversation_id;
  select * into v_ident from wa_identities where id = v_conv.identity_id;
  if v_ident.confirmed_email is null then return jsonb_build_object('ok',false,'code','email_required'); end if;
  select * into v_cart from wa_carts where conversation_id = v_conv.id and status = 'active';
  if not found then return jsonb_build_object('ok',false,'code','cart_empty'); end if;
  v_price := wa_price_cart(v_cart.id);
  if not (v_price->>'ok')::boolean then
    if v_price->>'code' = 'delivery_not_priced' then
      perform open_task(v_conv.store_id, null, 'price_delivery', 'support', 'high',
        'WhatsApp customer wants courier delivery but no delivery price is configured',
        'price_delivery:wa:' || v_conv.id, jsonb_build_object('conversation_id', v_conv.id));
    end if;
    return v_price;
  end if;
  select * into v_open from wa_checkout_intents
   where conversation_id = v_conv.id and status in ('awaiting_url','open','uncertain');
  v_set := wa_settings_for(v_conv.store_id);
  v_exp := clock_timestamp() + make_interval(mins => v_set.quote_minutes);

  update wa_checkout_quotes set status = 'superseded', decided_at = clock_timestamp()
   where conversation_id = v_conv.id and status = 'offered';
  insert into wa_checkout_quotes (store_id, conversation_id, cart_id, cart_revision, items, delivery, subtotal_cents,
         delivery_cents, total_cents, currency, email_snapshot, replaces_intent_id, replaces_total_cents, expires_at)
  values (v_conv.store_id, v_conv.id, v_cart.id, v_cart.revision, v_price->'items', v_price->'delivery',
          (v_price->>'subtotal_cents')::bigint, (v_price->>'delivery_cents')::bigint, (v_price->>'total_cents')::bigint,
          v_price->>'currency', v_ident.confirmed_email, v_open.id, v_open.total_cents, v_exp)
  returning id into v_q;
  return jsonb_build_object('ok',true,'quote_id',v_q,'items',v_price->'items','subtotal_cents',v_price->'subtotal_cents',
    'delivery_cents',v_price->'delivery_cents','total_cents',v_price->'total_cents','currency',v_price->>'currency',
    'email',v_ident.confirmed_email,'expires_at',v_exp,
    'replaces', case when v_open.id is null then null
                     else jsonb_build_object('intent_id',v_open.id,'total_cents',v_open.total_cents) end);
end $$;

-- 7) Confirm a quote → (atomically cancel the checkout it replaces) → one new checkout intent.
--    The customer's "yes" is bound to BOTH the old checkout (quote.replaces_intent_id must still
--    be the open one) and the exact new basket+total (quote revision + total).
--    Race with a payment on the old checkout: we take the SAME locks in the SAME order as
--    commerce_apply_verified_payment (payment attempt(s) → order), so exactly one wins:
--      • payment first  → order is confirmed → replacement refused ('old_checkout_paid').
--      • cancel first   → holds released + attempts cancelled (references kept) in THIS
--                         transaction; a later payment is recorded by M1 as paid_after_cancel:
--                         one owner exception task, no pack task, no paid confirmation.
--    If the NEW order can't be created (stock gone, price changed) the whole replacement is
--    rolled back (savepoint): the old link stays open and the customer is told so.
--    Replay of the same accepted quote returns the same intent (no second checkout).
create function public.commerce_wa_confirm_quote(p_turn_id uuid, p_lease_token uuid, p_quote_id uuid,
                                                 p_confirmed_total_cents bigint)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_err text; v_turn wa_turns; v_conv wa_conversations; v_ident wa_identities; v_q wa_checkout_quotes;
  v_cart wa_carts; v_open uuid; v_old wa_checkout_intents; v_old_order orders; v_store stores;
  v_res jsonb; v_fail jsonb; v_order_id uuid; v_att payment_attempts; v_int uuid; v_x wa_checkout_intents;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'confirm_quote');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  select * into v_turn from wa_turns where id = p_turn_id;
  select * into v_conv from wa_conversations where id = v_turn.conversation_id;
  select * into v_ident from wa_identities where id = v_conv.identity_id;
  select * into v_store from stores where id = v_conv.store_id;

  select * into v_q from wa_checkout_quotes where id = p_quote_id and conversation_id = v_conv.id for update;
  if not found then return jsonb_build_object('ok',false,'code','quote_not_found'); end if;

  if v_q.status = 'accepted' then                                  -- replayed "yes"
    select * into v_x from wa_checkout_intents where id = v_q.intent_id;
    return jsonb_build_object('ok',true,'replayed',true,'intent_id',v_x.id,'status',v_x.status,
                              'reference',v_x.reference,'total_cents',v_x.total_cents);
  end if;
  if v_q.status <> 'offered' then
    return jsonb_build_object('ok',false,'code','quote_not_current','status',v_q.status);
  end if;
  if v_q.expires_at <= clock_timestamp() then
    update wa_checkout_quotes set status = 'expired', decided_at = clock_timestamp() where id = v_q.id;
    return jsonb_build_object('ok',false,'code','quote_expired');
  end if;
  if p_confirmed_total_cents is distinct from v_q.total_cents then
    return jsonb_build_object('ok',false,'code','total_mismatch','total_cents',v_q.total_cents);
  end if;
  select * into v_cart from wa_carts where id = v_q.cart_id;
  if v_cart.status <> 'active' or v_cart.revision <> v_q.cart_revision then
    update wa_checkout_quotes set status = 'stale', decided_at = clock_timestamp() where id = v_q.id;
    return jsonb_build_object('ok',false,'code','cart_changed');
  end if;
  select id into v_open from wa_checkout_intents
   where conversation_id = v_conv.id and status in ('awaiting_url','open','uncertain');
  if v_open is distinct from v_q.replaces_intent_id then
    update wa_checkout_quotes set status = 'stale', decided_at = clock_timestamp() where id = v_q.id;
    return jsonb_build_object('ok',false,'code','checkout_changed');
  end if;

  if v_q.replaces_intent_id is not null then
    select * into v_old from wa_checkout_intents where id = v_q.replaces_intent_id;
    -- Lock order = commerce_apply_verified_payment: attempt(s) → order → (then) intent.
    perform 1 from payment_attempts where order_id = v_old.order_id order by id for update;
    select * into v_old_order from orders where id = v_old.order_id for update;
    select * into v_old from wa_checkout_intents where id = v_q.replaces_intent_id for update;
    if v_old_order.status <> 'awaiting_payment' or v_old.status not in ('awaiting_url','open','uncertain')
       or exists (select 1 from payment_attempts where order_id = v_old.order_id and status in ('succeeded','mismatch_held')) then
      update wa_checkout_quotes set status = 'refused_paid', decided_at = clock_timestamp() where id = v_q.id;
      return jsonb_build_object('ok',false,'code','old_checkout_paid','order_number',v_old_order.order_number,
                                'order_status',v_old_order.status);
    end if;
  end if;

  begin   -- ── savepoint: replacement is all-or-nothing ──
    -- products (id order) before reservations, as everywhere in M1
    perform 1 from products
     where id in (select product_id from order_items where order_id = v_old.order_id
                  union select p.id from products p where p.store_id = v_conv.store_id
                         and p.sku in (select x->>'sku' from jsonb_array_elements(v_q.items) x))
     order by id for update;
    if v_old.id is not null then
      perform wa_cancel_checkout(v_old.id, 'cancelled', 'whatsapp');
    end if;

    v_res := public.commerce_create_order(v_store.slug, jsonb_build_object('email', v_q.email_snapshot),
               (select jsonb_agg(jsonb_build_object('sku',x->>'sku','qty',(x->>'qty')::int)) from jsonb_array_elements(v_q.items) x),
               coalesce(v_q.delivery, '{"method":"collect"}'), v_q.total_cents, 'wa:quote:' || v_q.id, 'whatsapp');
    if not coalesce((v_res->>'ok')::boolean, false) then
      v_fail := v_res;
      raise exception using errcode = 'WA001', message = 'replacement order refused';
    end if;
    v_order_id := (v_res->>'order_id')::uuid;

    insert into wa_order_owners (order_id, store_id, channel_id, identity_id, owner_ref)
    values (v_order_id, v_conv.store_id, v_ident.channel_id, v_ident.id, v_ident.owner_ref);

    insert into payment_attempts (store_id, order_id, attempt_no, reference, amount_cents, currency)
    values (v_conv.store_id, v_order_id, 1, (v_res->>'order_number') || '-1', v_q.total_cents, v_q.currency)
    returning * into v_att;
    perform audit(v_conv.store_id, 'payment_attempt', v_att.id, 'created', 'whatsapp', null, 'pending',
                  jsonb_build_object('reference', v_att.reference, 'amount_cents', v_att.amount_cents));

    insert into wa_checkout_intents (store_id, conversation_id, identity_id, owner_ref, quote_id, order_id,
           payment_attempt_id, reference, total_cents, currency, email_snapshot)
    values (v_conv.store_id, v_conv.id, v_ident.id, v_ident.owner_ref, v_q.id, v_order_id, v_att.id, v_att.reference,
            v_q.total_cents, v_q.currency, v_q.email_snapshot)
    returning id into v_int;
    if v_old.id is not null then
      update wa_checkout_intents set superseded_by_intent_id = v_int where id = v_old.id;
    end if;
    update wa_checkout_quotes set status = 'accepted', intent_id = v_int, decided_at = clock_timestamp() where id = v_q.id;
  exception when sqlstate 'WA001' then
    update wa_checkout_quotes set status = 'failed', failure_code = v_fail->>'code', decided_at = clock_timestamp()
     where id = v_q.id;
    return jsonb_build_object('ok',false,'code',v_fail->>'code','detail',v_fail,
                              'previous_checkout_still_open', v_old.id is not null,
                              'previous_total_cents', v_old.total_cents);
  end;

  return jsonb_build_object('ok',true,'replayed',false,'intent_id',v_int,'order_number',v_res->>'order_number',
    'reference',v_att.reference,'total_cents',v_q.total_cents,'currency',v_q.currency,
    'replaced_intent_id',v_old.id,'next','initialize');
end $$;

-- 8) Checkout URL lifecycle (provider calls happen in app code, 2b+; these are the DB contracts).
--    claim_init → (Paystack initialize with the PERSISTED reference) → init_result / attach.
--    • 'initialize': no URL yet; the caller holds a short claim so two retries don't both call.
--    • 'send_url'  : URL already attached — resend it, never mint a new one.
--    • 'reconcile' : a previous call was ambiguous — verify by reference BEFORE anything else.
create function public.commerce_wa_checkout_claim_init(p_intent_id uuid, p_claim_seconds int default 30)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_int wa_checkout_intents; v_order orders; v_tok uuid := gen_random_uuid(); v_url text;
begin
  -- lock order: attempt → order → intent (same as payment application)
  perform 1 from payment_attempts where id = (select payment_attempt_id from wa_checkout_intents where id = p_intent_id) for update;
  select * into v_order from orders where id = (select order_id from wa_checkout_intents where id = p_intent_id) for update;
  select * into v_int from wa_checkout_intents where id = p_intent_id for update;
  if not found then return jsonb_build_object('action','none','code','intent_not_found'); end if;
  if v_int.status = 'open' then
    select authorization_url into v_url from payment_attempts where id = v_int.payment_attempt_id;
    return jsonb_build_object('action','send_url','url',v_url,'reference',v_int.reference);
  end if;
  if v_int.status = 'uncertain' then return jsonb_build_object('action','reconcile','reference',v_int.reference); end if;
  if v_int.status <> 'awaiting_url' then return jsonb_build_object('action','none','status',v_int.status); end if;
  if v_order.status <> 'awaiting_payment' then return jsonb_build_object('action','none','order_status',v_order.status); end if;
  if exists (select 1 from order_items oi where oi.order_id = v_order.id and not exists (
               select 1 from stock_reservations r where r.order_id = v_order.id and r.product_id = oi.product_id
                 and r.status = 'active' and r.expires_at > clock_timestamp() + interval '2 minutes')) then
    -- No URL was ever shown, so nobody can pay this reference: close it; customer re-confirms.
    perform wa_cancel_checkout(v_int.id, 'expired', 'whatsapp');
    return jsonb_build_object('action','expired');
  end if;
  if v_int.init_claim_until is not null and v_int.init_claim_until > clock_timestamp() then
    return jsonb_build_object('action','wait','reference',v_int.reference);
  end if;
  update wa_checkout_intents set init_claim_token = v_tok,
         init_claim_until = clock_timestamp() + make_interval(secs => greatest(5, least(coalesce(p_claim_seconds,30), 120))),
         updated_at = clock_timestamp() where id = v_int.id;
  return jsonb_build_object('action','initialize','claim_token',v_tok,'reference',v_int.reference,
    'amount_cents',v_int.total_cents,'currency',v_int.currency,'email',v_int.email_snapshot,
    'order_number',v_order.order_number,'attempt_id',v_int.payment_attempt_id);
end $$;

-- Paystack returned a URL for this reference. Accepted from awaiting_url OR uncertain (a URL
-- for OUR reference is genuine either way). If the intent was closed meanwhile, the URL is
-- recorded for audit but must not be sent.
create function public.commerce_wa_checkout_attach(p_intent_id uuid, p_reference text, p_url text, p_access_code text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_int wa_checkout_intents;
begin
  if coalesce(p_url,'') !~ '^https://' then return jsonb_build_object('ok',false,'code','invalid_url'); end if;
  perform 1 from payment_attempts where reference = p_reference for update;
  perform 1 from orders where id = (select order_id from wa_checkout_intents where id = p_intent_id) for update;
  select * into v_int from wa_checkout_intents where id = p_intent_id for update;
  if not found or v_int.reference <> p_reference then return jsonb_build_object('ok',false,'code','reference_mismatch'); end if;
  update payment_attempts set authorization_url = p_url, access_code = p_access_code, updated_at = now()
   where reference = p_reference and authorization_url is null;
  if v_int.status = 'open' then return jsonb_build_object('ok',true,'replayed',true); end if;
  if v_int.status not in ('awaiting_url','uncertain') then
    return jsonb_build_object('ok',false,'code','intent_closed','status',v_int.status);
  end if;
  update wa_checkout_intents set status = 'open', init_claim_token = null, init_claim_until = null, last_error = null,
         updated_at = clock_timestamp() where id = v_int.id;
  return jsonb_build_object('ok',true,'replayed',false);
end $$;

-- Provider call outcome without a URL. 'not_created' = Paystack definitely refused (e.g. 4xx
-- validation) → same reference may be retried. 'uncertain' = timeout/5xx/duplicate-reference →
-- must be reconciled (verify by reference) before ANY new reference is issued.
create function public.commerce_wa_checkout_init_result(p_intent_id uuid, p_reference text, p_claim_token uuid,
                                                        p_outcome text, p_error text default null)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_int wa_checkout_intents;
begin
  if p_outcome not in ('not_created','uncertain') then return jsonb_build_object('ok',false,'code','invalid_outcome'); end if;
  select * into v_int from wa_checkout_intents where id = p_intent_id for update;
  if not found or v_int.reference <> p_reference then return jsonb_build_object('ok',false,'code','reference_mismatch'); end if;
  if v_int.status <> 'awaiting_url' or v_int.init_claim_token is distinct from p_claim_token then
    return jsonb_build_object('ok',false,'code','not_claimed','status',v_int.status);    -- e.g. a parallel attach already won
  end if;
  update wa_checkout_intents set status = case when p_outcome = 'uncertain' then 'uncertain' else 'awaiting_url' end,
         init_claim_token = null, init_claim_until = null, last_error = left(p_error, 300), updated_at = clock_timestamp()
   where id = v_int.id;
  return jsonb_build_object('ok',true,'status',case when p_outcome = 'uncertain' then 'uncertain' else 'awaiting_url' end);
end $$;

-- Reconcile an uncertain intent with the facts from Paystack verify (by reference):
--   not found at provider     → nothing exists: retry initialize with the SAME reference.
--   found, not successful     → the transaction exists but we never got (or showed) its URL:
--                               retire that attempt (reference kept for late matching) and
--                               issue the next reference on the same order.
--   found, success            → refused here: apply the payment first (M1 reconcile path).
create function public.commerce_wa_checkout_resolve(p_intent_id uuid, p_reference text, p_provider_found boolean,
                                                    p_provider_status text default null)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_int wa_checkout_intents; v_order orders; v_no int; v_att payment_attempts;
begin
  perform 1 from payment_attempts where order_id = (select order_id from wa_checkout_intents where id = p_intent_id)
   order by id for update;
  select * into v_order from orders where id = (select order_id from wa_checkout_intents where id = p_intent_id) for update;
  select * into v_int from wa_checkout_intents where id = p_intent_id for update;
  if not found or v_int.reference <> p_reference then return jsonb_build_object('ok',false,'code','reference_mismatch'); end if;
  if v_int.status <> 'uncertain' then return jsonb_build_object('ok',false,'code','not_uncertain','status',v_int.status); end if;
  if v_order.status <> 'awaiting_payment' then return jsonb_build_object('ok',false,'code','order_not_payable'); end if;
  if p_provider_found is null then return jsonb_build_object('ok',false,'code','provider_answer_required'); end if;
  if not p_provider_found then
    update wa_checkout_intents set status = 'awaiting_url', updated_at = clock_timestamp() where id = v_int.id;
    return jsonb_build_object('ok',true,'next','initialize','reference',v_int.reference);
  end if;
  if p_provider_status = 'success' then return jsonb_build_object('ok',false,'code','apply_payment_first'); end if;

  update payment_attempts set status = 'cancelled', last_error = 'retired: initialized but URL never received',
         updated_at = now() where id = v_int.payment_attempt_id and status in ('pending','unknown');
  select coalesce(max(attempt_no),0) + 1 into v_no from payment_attempts where order_id = v_order.id;
  if v_no > 5 then
    perform wa_cancel_checkout(v_int.id, 'cancelled', 'whatsapp');
    perform wa_pause(v_int.conversation_id, 'agent_failure', 'checkout attempts exhausted');
    return jsonb_build_object('ok',false,'code','too_many_attempts');
  end if;
  insert into payment_attempts (store_id, order_id, attempt_no, reference, amount_cents, currency)
  values (v_order.store_id, v_order.id, v_no, v_order.order_number || '-' || v_no, v_int.total_cents, v_int.currency)
  returning * into v_att;
  update wa_checkout_intents set payment_attempt_id = v_att.id, reference = v_att.reference, status = 'awaiting_url',
         updated_at = clock_timestamp() where id = v_int.id;
  return jsonb_build_object('ok',true,'next','initialize','reference',v_att.reference);
end $$;

-- 9) Order status: ONLY orders owned by this conversation's owner_ref. A number that isn't
--    yours gets the same answer as a number that doesn't exist (no oracle).
create function public.commerce_wa_customer_orders(p_turn_id uuid, p_lease_token uuid, p_order_number text default null)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_ref uuid; v_list jsonb;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'order_status');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  select i.owner_ref into v_ref from wa_turns t join wa_conversations c on c.id = t.conversation_id
    join wa_identities i on i.id = c.identity_id where t.id = p_turn_id;
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') into v_list from (
    select jsonb_build_object('order_number',o.order_number,'status',o.status,'fulfilment_status',o.fulfilment_status,
             'total_cents',o.total_cents,'currency',o.currency,'paid_at',o.paid_at,'created_at',o.created_at) x
      from wa_order_owners w join orders o on o.id = w.order_id
     where w.owner_ref = v_ref and (p_order_number is null or o.order_number = upper(trim(p_order_number)))
     order by o.created_at desc limit 5) s;
  if p_order_number is not null and jsonb_array_length(v_list) = 0 then
    return jsonb_build_object('ok',false,'code','order_not_found');
  end if;
  return jsonb_build_object('ok',true,'orders',v_list);
end $$;

-- 10) Handoff and owner mode changes.
create function public.commerce_wa_request_human(p_turn_id uuid, p_lease_token uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_turn wa_turns;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'request_human');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  -- A category code, never free text: task context must not hold customer message content.
  if coalesce(p_reason,'other') not in ('asked_for_person','complaint','cannot_help','payment_problem','other') then
    return jsonb_build_object('ok',false,'code','invalid_reason');
  end if;
  select * into v_turn from wa_turns where id = p_turn_id;
  perform wa_pause(v_turn.conversation_id, 'customer_request', coalesce(p_reason,'other'));
  return jsonb_build_object('ok',true,'mode','human_requested');
end $$;

create function public.commerce_wa_owner_set_mode(p_conversation_id uuid, p_mode text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_conv wa_conversations;
begin
  if p_mode not in ('bot_active','human_active','closed') then return jsonb_build_object('ok',false,'code','invalid_mode'); end if;
  if coalesce(p_actor,'') !~ '^owner:' then return jsonb_build_object('ok',false,'code','owner_actor_required'); end if;
  select * into v_conv from wa_conversations where id = p_conversation_id for no key update;
  if not found then return jsonb_build_object('ok',false,'code','conversation_not_found'); end if;
  update wa_conversations set mode = p_mode,
         pause_reason = case when p_mode = 'human_active' then coalesce(pause_reason,'owner_takeover') when p_mode = 'bot_active' then null else pause_reason end,
         owner_unread_since = case when p_mode = 'human_active' then null else owner_unread_since end,
         updated_at = now() where id = p_conversation_id;
  if p_mode = 'bot_active' then
    update handoff_tasks set status = 'resolved', resolved_at = now(), updated_at = now(), resolution = 'Bot resumed'
     where active_key = 'wa_handoff:' || p_conversation_id and status not in ('resolved','cancelled');
  end if;
  perform audit(v_conv.store_id, 'wa_conversation', p_conversation_id, 'mode_set', p_actor, v_conv.mode, p_mode, '{}');
  return jsonb_build_object('ok',true,'from',v_conv.mode,'to',p_mode);
end $$;

-- 11) Model budget. Reserve BEFORE a model call; settle after. Atomic: one UPDATE with the
--     cap in its WHERE clause, so concurrent turns can never jointly exceed the cap.
--     Day = local date in wa_settings.budget_timezone (default midnight Africa/Johannesburg).
--     When exhausted: conversation → human (reason 'budget'), one owner task per day,
--     one scripted "resting" notice per conversation per day.
create function public.commerce_wa_reserve_model_spend(p_turn_id uuid, p_lease_token uuid, p_amount_micro_usd bigint)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_err text; v_turn wa_turns; v_set wa_settings; v_day date; v_b wa_model_budget; v_res uuid;
begin
  v_err := wa_turn_guard(p_turn_id, p_lease_token, 'model');
  if v_err is not null then return jsonb_build_object('ok',false,'code',v_err); end if;
  if p_amount_micro_usd is null or p_amount_micro_usd <= 0 or p_amount_micro_usd > 1000000 then
    return jsonb_build_object('ok',false,'code','invalid_amount');
  end if;
  select * into v_turn from wa_turns where id = p_turn_id;
  v_set := wa_settings_for(v_turn.store_id);
  v_day := (clock_timestamp() at time zone v_set.budget_timezone)::date;
  insert into wa_model_budget (store_id, day, cap_micro_usd) values (v_turn.store_id, v_day, v_set.daily_model_cap_micro_usd)
  on conflict (store_id, day) do nothing;
  update wa_model_budget set reserved_micro_usd = reserved_micro_usd + p_amount_micro_usd
   where store_id = v_turn.store_id and day = v_day
     and reserved_micro_usd + spent_micro_usd + p_amount_micro_usd <= cap_micro_usd
  returning * into v_b;
  if not found then
    update wa_model_budget set exhausted_at = coalesce(exhausted_at, clock_timestamp())
     where store_id = v_turn.store_id and day = v_day;
    perform wa_pause(v_turn.conversation_id, 'budget', 'daily model budget reached');
    perform open_task(v_turn.store_id, null, 'wa_budget_exhausted', 'owner_finance', 'high',
      'Daily AI budget reached — WhatsApp conversations are being handed to a person',
      'wa_budget:' || v_turn.store_id || ':' || v_day, jsonb_build_object('day', v_day));
    perform wa_queue_out(v_turn.conversation_id, null, 'resting_notice',
      'resting:' || v_turn.conversation_id || ':' || v_day, jsonb_build_object('type','template','template','resting_notice'));
    return jsonb_build_object('ok',false,'code','budget_exhausted','day',v_day);
  end if;
  insert into wa_model_reservations (store_id, day, turn_id, amount_micro_usd)
  values (v_turn.store_id, v_day, p_turn_id, p_amount_micro_usd) returning id into v_res;
  return jsonb_build_object('ok',true,'reservation_id',v_res,'day',v_day,
                            'remaining_micro_usd', v_b.cap_micro_usd - v_b.reserved_micro_usd - v_b.spent_micro_usd);
end $$;

-- Actual cost after the call (may exceed the reservation; money already spent is recorded).
create function public.commerce_wa_settle_model_spend(p_reservation_id uuid, p_actual_micro_usd bigint)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_r wa_model_reservations;
begin
  select * into v_r from wa_model_reservations where id = p_reservation_id for update;
  if not found then return jsonb_build_object('ok',false,'code','reservation_not_found'); end if;
  if v_r.status = 'settled' then return jsonb_build_object('ok',true,'replayed',true); end if;
  update wa_model_budget set reserved_micro_usd = reserved_micro_usd - v_r.amount_micro_usd,
         spent_micro_usd = spent_micro_usd + greatest(coalesce(p_actual_micro_usd, v_r.amount_micro_usd), 0)
   where store_id = v_r.store_id and day = v_r.day;
  update wa_model_reservations set status = 'settled',
         actual_micro_usd = greatest(coalesce(p_actual_micro_usd, v_r.amount_micro_usd), 0) where id = v_r.id;
  return jsonb_build_object('ok',true,'replayed',false);
end $$;

-- 12) Outbound dispatch contracts (the sender itself is 2b).
--     • One message in flight per conversation, oldest first (keeps order).
--     • 24-hour rule applied AT DISPATCH: outside the window → 'window_closed' + owner task.
--       (No approved templates in M2.)
--     • A claim whose lease lapsed (sender crashed / timed out mid-send) becomes 'uncertain'
--       and is NEVER auto-resent; it needs commerce_wa_outbound_resolve.
create function public.commerce_wa_claim_outbound(p_limit int default 5, p_claim_seconds int default 30)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_row record; v_out jsonb := '[]'; v_tok uuid; v_n int := 0;
begin
  for v_row in update wa_outbox set status = 'uncertain', claim_token = null, updated_at = clock_timestamp(),
                      last_error = 'send lease expired without a result'
                where status = 'sending' and claim_until <= clock_timestamp() returning store_id, conversation_id loop
    perform open_task(v_row.store_id, null, 'wa_uncertain_send', 'support', 'normal',
      'A WhatsApp message may or may not have been delivered — check before resending',
      'wa_uncertain:' || v_row.conversation_id, jsonb_build_object('conversation_id', v_row.conversation_id));
  end loop;

  -- 24-hour rule: every queued message outside the window is closed (never sent) + owner task.
  for v_row in update wa_outbox o set status = 'window_closed', updated_at = clock_timestamp()
                 from wa_conversations c
                where c.id = o.conversation_id and o.status = 'queued'
                  and (c.last_inbound_at is null or clock_timestamp() > c.last_inbound_at + interval '24 hours')
                returning o.id, o.store_id, o.conversation_id, o.purpose loop
    perform open_task(v_row.store_id, null, 'wa_window_closed', 'support',
      case when v_row.purpose = 'paid_confirmation' then 'high' else 'normal' end,
      'Customer is outside WhatsApp''s 24-hour window — contact them another way',
      'wa_window:' || v_row.conversation_id, jsonb_build_object('conversation_id', v_row.conversation_id));
  end loop;

  for v_row in
    select o.id, o.store_id, o.conversation_id, o.purpose, o.payload, c.last_inbound_at, i.wa_id, ch.phone_number_id
      from wa_outbox o join wa_conversations c on c.id = o.conversation_id
      join wa_identities i on i.id = c.identity_id join wa_channels ch on ch.id = i.channel_id
     where o.status = 'queued'
       and o.id = (select min(o2.id) from wa_outbox o2 where o2.conversation_id = o.conversation_id and o2.status = 'queued')
       and not exists (select 1 from wa_outbox o3 where o3.conversation_id = o.conversation_id and o3.status = 'sending')
     order by o.id
     limit greatest(1, least(coalesce(p_limit,5), 25))
     for update of o skip locked
  loop
    if v_row.last_inbound_at is null or clock_timestamp() > v_row.last_inbound_at + interval '24 hours' then
      continue;     -- window closed between the sweep above and now: left queued, swept next run
    end if;
    v_tok := gen_random_uuid();
    update wa_outbox set status = 'sending', claim_token = v_tok, attempts = attempts + 1,
           claim_until = clock_timestamp() + make_interval(secs => greatest(5, least(coalesce(p_claim_seconds,30), 120))),
           updated_at = clock_timestamp() where id = v_row.id;
    v_out := v_out || jsonb_build_object('id',v_row.id,'claim_token',v_tok,'purpose',v_row.purpose,'payload',v_row.payload,
                                         'to',v_row.wa_id,'phone_number_id',v_row.phone_number_id);
  end loop;
  return v_out;
end $$;

create function public.commerce_wa_outbound_result(p_id bigint, p_claim_token uuid, p_outcome text,
                                                   p_provider_message_id text default null, p_error text default null)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_o wa_outbox;
begin
  if p_outcome not in ('sent','failed','uncertain') then return jsonb_build_object('ok',false,'code','invalid_outcome'); end if;
  if p_outcome = 'sent' and coalesce(p_provider_message_id,'') = '' then return jsonb_build_object('ok',false,'code','provider_id_required'); end if;
  update wa_outbox set status = p_outcome, provider_message_id = nullif(p_provider_message_id,''), claim_token = null,
         sent_at = case when p_outcome = 'sent' then clock_timestamp() end, last_error = left(p_error, 300),
         updated_at = clock_timestamp()
   where id = p_id and status = 'sending' and claim_token = p_claim_token returning * into v_o;
  if not found then return jsonb_build_object('ok',false,'code','not_claimed'); end if;
  if p_outcome = 'uncertain' then
    perform open_task(v_o.store_id, null, 'wa_uncertain_send', 'support', 'normal',
      'A WhatsApp message may or may not have been delivered — check before resending',
      'wa_uncertain:' || v_o.conversation_id, jsonb_build_object('conversation_id', v_o.conversation_id));
  end if;
  return jsonb_build_object('ok',true);
end $$;

-- Status callbacks: move forward only; never create a reply.
create function public.commerce_wa_outbound_status(p_provider_message_id text, p_status text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_n int;
begin
  update wa_outbox set status = p_status, updated_at = clock_timestamp()
   where provider_message_id = p_provider_message_id
     and ((p_status = 'delivered' and status = 'sent') or (p_status = 'read' and status in ('sent','delivered'))
          or (p_status = 'failed' and status in ('sent','delivered')));
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok',true,'updated',v_n > 0);
end $$;

-- Explicit decision for an uncertain send ('requeue' = send again knowingly, 'cancel' = don't).
create function public.commerce_wa_outbound_resolve(p_id bigint, p_decision text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_o wa_outbox;
begin
  if p_decision not in ('requeue','cancel') then return jsonb_build_object('ok',false,'code','invalid_decision'); end if;
  update wa_outbox set status = case when p_decision = 'requeue' then 'queued' else 'cancelled' end, updated_at = clock_timestamp()
   where id = p_id and status = 'uncertain' returning * into v_o;
  if not found then return jsonb_build_object('ok',false,'code','not_uncertain'); end if;
  perform audit(v_o.store_id, 'wa_outbox', null, 'uncertain_resolved', coalesce(p_actor,'system'), 'uncertain', v_o.status,
                jsonb_build_object('outbox_id', p_id));
  return jsonb_build_object('ok',true,'status',v_o.status);
end $$;

-- 13) Retention (decision 4). Daily job. Purges message text and media wherever WE store a
--     copy: inbound body/media id, outbox payloads (rendered text, URLs), cart + quote
--     addresses and receipt-email snapshots on quotes, display names / pending emails of
--     inactive identities. Kept: replay metadata (message ids, timestamps, kinds) and the
--     order/payment records (5 years — see docs/milestone-2-plan.md §11).
create function public.commerce_wa_purge_expired(p_batch int default 5000)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_in int; v_out int; v_q int; v_c int; v_i int; v_lim int := greatest(1, least(coalesce(p_batch,5000), 50000));
begin
  update wa_inbound i set body = null, media_id = null, redacted_at = clock_timestamp()
   where i.id in (select x.id from wa_inbound x join wa_settings s on s.store_id = x.store_id
                   where x.redacted_at is null and x.received_at < clock_timestamp() - make_interval(days => s.message_retention_days)
                   limit v_lim);
  get diagnostics v_in = row_count;
  update wa_outbox o set payload = null, redacted_at = clock_timestamp()
   where o.id in (select x.id from wa_outbox x join wa_settings s on s.store_id = x.store_id
                   where x.redacted_at is null and x.status not in ('queued','sending')
                     and x.created_at < clock_timestamp() - make_interval(days => s.message_retention_days) limit v_lim);
  get diagnostics v_out = row_count;
  update wa_checkout_quotes q set delivery = null, email_snapshot = null
   where q.id in (select x.id from wa_checkout_quotes x join wa_settings s on s.store_id = x.store_id
                   where (x.delivery is not null or x.email_snapshot is not null)
                     and x.created_at < clock_timestamp() - make_interval(days => s.message_retention_days) limit v_lim);
  get diagnostics v_q = row_count;
  update wa_carts k set delivery = null
   where k.id in (select x.id from wa_carts x join wa_settings s on s.store_id = x.store_id
                   where x.delivery is not null
                     and x.updated_at < clock_timestamp() - make_interval(days => s.message_retention_days) limit v_lim);
  get diagnostics v_c = row_count;
  update wa_identities d set display_name = null, pending_email = null,
         confirmed_email = case when exists (select 1 from wa_order_owners w where w.identity_id = d.id) then confirmed_email end
   where d.id in (select x.id from wa_identities x join wa_conversations c on c.identity_id = x.id
                   join wa_settings s on s.store_id = x.store_id
                   where (x.display_name is not null or x.pending_email is not null or x.confirmed_email is not null)
                     and coalesce(c.last_inbound_at, x.created_at) < clock_timestamp() - make_interval(days => s.message_retention_days)
                   limit v_lim);
  get diagnostics v_i = row_count;
  return jsonb_build_object('inbound',v_in,'outbox',v_out,'quotes',v_q,'carts',v_c,'identities',v_i);
end $$;

-- ─── Payment hooks (run INSIDE the M1 payment transaction) ─────────────────

-- awaiting_payment → confirmed on a WhatsApp order: intent paid, cart closed (if unchanged
-- since the quote), ONE fixed paid confirmation per order (dedup key) rendered from the order
-- record — also while paused (owner alerted; bot stays paused).
create function commerce.wa_on_order_confirmed() returns trigger
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_int wa_checkout_intents; v_conv wa_conversations; v_rev int;
begin
  select * into v_int from wa_checkout_intents where order_id = new.id;
  if not found then return new; end if;
  update wa_checkout_intents set status = 'paid', init_claim_token = null, updated_at = clock_timestamp()
   where id = v_int.id and status in ('awaiting_url','open','uncertain');
  select cart_revision into v_rev from wa_checkout_quotes where id = v_int.quote_id;
  update wa_carts set status = 'ordered', updated_at = now()
   where id = (select cart_id from wa_checkout_quotes where id = v_int.quote_id) and status = 'active' and revision = v_rev;
  perform wa_queue_out(v_int.conversation_id, null, 'paid_confirmation', 'paid:' || new.id,
    jsonb_build_object('type','template','template','paid_confirmation','order_number',new.order_number,
                       'total_cents',new.total_cents,'currency',new.currency,'on_hold',new.fulfilment_status = 'on_hold'));
  select * into v_conv from wa_conversations where id = v_int.conversation_id;
  if v_conv.mode <> 'bot_active' then
    perform open_task(new.store_id, new.id, 'wa_paid_during_takeover', 'support', 'high',
      'Order paid while a person has this WhatsApp conversation — confirmation was sent automatically',
      'wa_paid_takeover:' || new.id, jsonb_build_object('conversation_id', v_conv.id, 'order_number', new.order_number));
  end if;
  return new;
end $$;
create trigger wa_on_order_confirmed after update of status on commerce.orders
  for each row when (old.status = 'awaiting_payment' and new.status = 'confirmed')
  execute function commerce.wa_on_order_confirmed();

-- Money arrived on a cancelled/expired WhatsApp checkout. M1 already records the money and
-- opens ONE 'paid_after_cancel' owner task (no pack task, no owner paid-order job). We only
-- mark the intent so the conversation view shows it. No customer message is queued.
create function commerce.wa_on_attempt_succeeded() returns trigger
language plpgsql security definer set search_path = commerce, pg_temp as $$
begin
  update wa_checkout_intents i set status = 'paid_after_cancel', updated_at = clock_timestamp()
    from orders o
   where i.order_id = new.order_id and o.id = new.order_id and o.status = 'cancelled' and i.status in ('cancelled','expired');
  return new;
end $$;
create trigger wa_on_attempt_succeeded after update of status on commerce.payment_attempts
  for each row when (new.status = 'succeeded' and old.status is distinct from 'succeeded')
  execute function commerce.wa_on_attempt_succeeded();

-- ─── Milestone 1 guard: WhatsApp checkouts are managed only through their intent ─────
-- Identical to 001's commerce_start_payment_attempt except the 'managed_by_whatsapp' check,
-- so the owner page can never mint a second, untracked link for a WhatsApp order.
create or replace function public.commerce_start_payment_attempt(p_order_id uuid, p_actor text default 'system')
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_order  orders;
  v_email  text;
  v_att    payment_attempts;
  v_no     int;
  v_ref    text;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'code','order_not_found'); end if;
  if exists (select 1 from wa_checkout_intents where order_id = p_order_id) then
    return jsonb_build_object('ok',false,'code','managed_by_whatsapp');
  end if;
  if v_order.status <> 'awaiting_payment' then
    return jsonb_build_object('ok',false,'code','order_not_payable','status',v_order.status);
  end if;
  if exists (select 1 from order_items oi where oi.order_id = v_order.id and not exists (
               select 1 from stock_reservations r where r.order_id = v_order.id and r.product_id = oi.product_id
                 and r.status = 'active' and r.expires_at > clock_timestamp() + interval '2 minutes')) then
    return jsonb_build_object('ok',false,'code','reservation_expired');
  end if;

  select * into v_att from payment_attempts
   where order_id = v_order.id and status = 'pending' and authorization_url is not null
     and created_at > now() - interval '20 minutes'
   order by attempt_no desc limit 1;
  if found then
    return jsonb_build_object('ok',true,'reused',true,'attempt_id',v_att.id,'reference',v_att.reference,
                              'authorization_url',v_att.authorization_url);
  end if;

  select coalesce(max(attempt_no),0) + 1 into v_no from payment_attempts where order_id = v_order.id;
  if v_no > 5 then return jsonb_build_object('ok',false,'code','too_many_attempts'); end if;

  v_ref := v_order.order_number || '-' || v_no;
  select email into v_email from customers where id = v_order.customer_id;

  insert into payment_attempts (store_id, order_id, attempt_no, reference, amount_cents, currency)
  values (v_order.store_id, v_order.id, v_no, v_ref, v_order.total_cents, v_order.currency)
  returning * into v_att;

  perform audit(v_order.store_id, 'payment_attempt', v_att.id, 'created', p_actor, null, 'pending',
                jsonb_build_object('reference',v_ref,'amount_cents',v_order.total_cents));

  return jsonb_build_object('ok',true,'reused',false,'attempt_id',v_att.id,'reference',v_ref,
    'amount_cents',v_att.amount_cents,'currency',v_att.currency,'email',v_email,
    'order_number',v_order.order_number);
end $$;

-- ─── Lock down (same rule as 001): only service_role may call public.commerce_* ──
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'commerce\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig); end if;
  end loop;
end $$;
revoke all on all functions in schema commerce from public;

-- ─── Settings + test channel for the existing test store (no secrets) ────────
insert into commerce.wa_settings (store_id)
select id from commerce.stores where slug = 'inkanyezi-test' on conflict do nothing;
insert into commerce.wa_channels (store_id, phone_number_id, label)
select id, '1384792444725788', 'Meta test number' from commerce.stores where slug = 'inkanyezi-test'
on conflict (phone_number_id) do nothing;

-- ─── Daily retention job (only if pg_cron is installed — it is on Supabase) ──
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('commerce-wa-retention', '15 0 * * *', 'select public.commerce_wa_purge_expired();');  -- 02:15 SAST
  end if;
end $$;
