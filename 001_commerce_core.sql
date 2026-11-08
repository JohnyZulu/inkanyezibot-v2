-- ════════════════════════════════════════════════════════════════════════════
-- Inkanyezi Commerce — Milestone 1: headless paid-order core
-- File: supabase/001_commerce_core.sql      Architecture: v0.3 (§7–§9, §14)
--
-- Paste the WHOLE file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run only on an EMPTY project (it creates tables; it does not migrate).
--
-- Design rules enforced here (the database is the transactional core):
--   • Money = integer cents (bigint) + explicit currency. Totals are computed
--     here from stored prices — a caller can never supply a price.
--   • Stock ledger: available = on_hand − active(unexpired) reservations − allocations.
--     Reserve at order creation → allocate on verified payment → consume
--     (decrement on_hand) when handed to courier. Units are never subtracted twice.
--   • Every state change is a guarded transition + an audit row.
--   • Order numbers come from a sequence + UNIQUE constraint (never count+1).
--   • Tables live in the private `commerce` schema (not exposed by the API).
--     The only callable surface is public.commerce_* functions, executable by
--     service_role ONLY (your server). The anon/publishable key can call nothing.
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists commerce;
revoke all on schema commerce from public;

-- ─── Tables ────────────────────────────────────────────────────────────────

create table commerce.stores (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name                 text not null,
  currency             char(3) not null default 'ZAR',
  order_prefix         text not null default 'INK' check (order_prefix ~ '^[A-Z]{2,6}$'),
  -- D17 (open business setting): NULL = courier delivery is NOT priced yet.
  -- While NULL, courier orders are refused and a human task is opened instead.
  flat_delivery_cents  bigint check (flat_delivery_cents >= 0),
  reservation_minutes  integer not null default 30 check (reservation_minutes between 5 and 1440),
  owner_name           text not null,
  created_at           timestamptz not null default now()
);

-- One row = one sellable unit (a "variant" in v0.3 terms). Variants can be split
-- out later without changing the order/payment logic.
create table commerce.products (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references commerce.stores(id),
  sku          text not null check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,40}$'),
  name         text not null,
  description  text,
  price_cents  bigint not null check (price_cents > 0),
  currency     char(3) not null,
  active       boolean not null default true,
  on_hand      integer not null default 0 check (on_hand >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (store_id, sku)
);

create table commerce.customers (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references commerce.stores(id),
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name        text,
  phone       text,
  created_at  timestamptz not null default now(),
  unique (store_id, email)
);

create sequence commerce.order_number_seq start 1001;

create table commerce.orders (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references commerce.stores(id),
  customer_id             uuid not null references commerce.customers(id),
  order_number            text not null unique,
  idempotency_key         text,
  status                  text not null default 'awaiting_payment'
                          check (status in ('draft','awaiting_payment','confirmed','completed','cancelled')),
  fulfilment_status       text not null default 'awaiting_payment'
                          check (fulfilment_status in ('awaiting_payment','ready_to_pack','packing','packed',
                                                       'handed_to_courier','completed','on_hold')),
  exception_flags         text[] not null default '{}',
  currency                char(3) not null,
  subtotal_cents          bigint not null check (subtotal_cents >= 0),
  delivery_cents          bigint not null check (delivery_cents >= 0),
  total_cents             bigint not null check (total_cents > 0),
  delivery                jsonb not null,           -- frozen delivery snapshot
  reservation_expires_at  timestamptz,
  paid_at                 timestamptz,
  courier_name            text,                     -- Milestone 1: manual entry (shipments table = Phase 5)
  courier_tracking_ref    text,
  created_by              text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (total_cents = subtotal_cents + delivery_cents),
  unique (store_id, idempotency_key)
);

create table commerce.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references commerce.orders(id),
  product_id        uuid not null references commerce.products(id),
  sku               text not null,
  name              text not null,                  -- frozen at order time
  unit_price_cents  bigint not null check (unit_price_cents > 0),
  qty               integer not null check (qty between 1 and 10),
  line_total_cents  bigint not null,
  check (line_total_cents = unit_price_cents * qty),
  unique (order_id, product_id)
);

create table commerce.stock_reservations (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references commerce.stores(id),
  product_id  uuid not null references commerce.products(id),
  order_id    uuid not null references commerce.orders(id),
  qty         integer not null check (qty > 0),
  status      text not null check (status in ('active','released','allocated','consumed')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index stock_res_live_idx on commerce.stock_reservations (product_id) where status in ('active','allocated');
create index stock_res_order_idx on commerce.stock_reservations (order_id);

create table commerce.payment_attempts (
  id                     uuid primary key default gen_random_uuid(),
  store_id               uuid not null references commerce.stores(id),
  order_id               uuid not null references commerce.orders(id),
  attempt_no             integer not null check (attempt_no between 1 and 5),
  provider               text not null default 'paystack',
  reference              text not null unique,       -- e.g. INK-001001-1
  amount_cents           bigint not null check (amount_cents > 0),   -- EXPECTED
  currency               char(3) not null,
  -- v0.3 states + 'mismatch_held' (money arrived but amount/currency differ → owner reconciles)
  status                 text not null default 'pending'
                         check (status in ('pending','succeeded','failed','cancelled','unknown','mismatch_held')),
  authorization_url      text,
  access_code            text,
  provider_txn_id        text,
  received_amount_cents  bigint,
  received_currency      text,
  last_error             text,
  verified_at            timestamptz,
  last_checked_at        timestamptz,                 -- last time the reconciler asked Paystack (fair rotation)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (order_id, attempt_no)
);
create index pay_attempt_open_idx on commerce.payment_attempts (last_checked_at nulls first, created_at)
  where status in ('pending','unknown');

create table commerce.payment_events (
  id            bigserial primary key,
  provider      text not null,
  dedup_key     text not null unique,                -- e.g. paystack:charge.success:<txn id>
  event_type    text not null,
  reference     text,
  payload       jsonb not null,                      -- contains PII: POPIA retention applies
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  outcome       text
);

create table commerce.handoff_tasks (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references commerce.stores(id),
  order_id     uuid references commerce.orders(id),
  kind         text not null,
  role         text not null check (role in ('fulfilment','logistics','support','owner_finance')),
  assignee     text not null,
  status       text not null default 'open'
               check (status in ('open','assigned','in_progress','waiting_customer','resolved','cancelled')),
  priority     text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  reason       text not null,
  context      jsonb not null default '{}',
  active_key   text not null,
  resolution   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
-- One ACTIVE task per key (prevents escalation spam); resolved tasks don't block new ones.
create unique index handoff_active_key_uq on commerce.handoff_tasks (active_key)
  where status not in ('resolved','cancelled');

create table commerce.jobs (           -- transactional outbox
  id            bigserial primary key,
  store_id      uuid references commerce.stores(id),
  kind          text not null,
  payload       jsonb not null default '{}',
  status        text not null default 'pending'
                check (status in ('pending','running','done','skipped','dead')),
  attempts      integer not null default 0,
  max_attempts  integer not null default 8,
  run_after     timestamptz not null default now(),
  dedup_key     text not null unique,
  locked_at     timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index jobs_due_idx on commerce.jobs (run_after) where status in ('pending','running');

create table commerce.audit_events (
  id          bigserial primary key,
  store_id    uuid,
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  actor       text not null,
  from_state  text,
  to_state    text,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_entity_idx on commerce.audit_events (entity, entity_id);

-- ─── Internal helpers (commerce schema — not callable via the API) ──────────

create function commerce.audit(p_store uuid, p_entity text, p_entity_id uuid, p_action text,
                               p_actor text, p_from text, p_to text, p_detail jsonb default '{}')
returns void language sql as $$
  insert into commerce.audit_events (store_id, entity, entity_id, action, actor, from_state, to_state, detail)
  values (p_store, p_entity, p_entity_id, p_action, p_actor, p_from, p_to, coalesce(p_detail, '{}'));
$$;

-- Expiry is judged by clock_timestamp() (the real time now), NOT now() (the time the
-- transaction started). Every function that decides "is this hold still live?" uses the
-- same clock, so two transactions can never disagree about whether a hold has expired.
create function commerce.available_qty(p_product_id uuid)
returns integer language sql volatile as $$
  select p.on_hand - coalesce((
           select sum(r.qty)::int from commerce.stock_reservations r
           where r.product_id = p.id
             and (r.status = 'allocated' or (r.status = 'active' and r.expires_at > clock_timestamp()))
         ), 0)
  from commerce.products p where p.id = p_product_id;
$$;

create function commerce.open_task(p_store uuid, p_order uuid, p_kind text, p_role text,
                                   p_priority text, p_reason text, p_active_key text, p_context jsonb default '{}')
returns void language plpgsql as $$
declare v_assignee text;
begin
  select owner_name into v_assignee from commerce.stores where id = p_store;
  insert into commerce.handoff_tasks (store_id, order_id, kind, role, assignee, priority, reason, active_key, context)
  values (p_store, p_order, p_kind, p_role, v_assignee, p_priority, p_reason, p_active_key, coalesce(p_context,'{}'))
  on conflict (active_key) where status not in ('resolved','cancelled') do nothing;
end $$;

create function commerce.enqueue_job(p_store uuid, p_kind text, p_dedup text, p_payload jsonb)
returns void language sql as $$
  insert into commerce.jobs (store_id, kind, dedup_key, payload)
  values (p_store, p_kind, p_dedup, p_payload)
  on conflict (dedup_key) do nothing;
$$;

create function commerce.add_flag(p_order uuid, p_flag text)
returns void language sql as $$
  update commerce.orders
     set exception_flags = case when p_flag = any(exception_flags) then exception_flags
                                else array_append(exception_flags, p_flag) end,
         updated_at = now()
   where id = p_order;
$$;

-- ═══ Public API (service_role only — see grants at the bottom) ═════════════

-- 1) Create order: validate → lock stock → server-side totals → reserve → number.
--    Business rejections return {ok:false, code}; nothing is half-written.
create function public.commerce_create_order(
  p_store_slug            text,
  p_customer              jsonb,    -- {email, name?, phone?}
  p_items                 jsonb,    -- [{sku, qty}]
  p_delivery              jsonb,    -- {method:'collect'|'courier', line1?, city?, postal_code?, ...}
  p_expected_total_cents  bigint default null,  -- what the customer confirmed; mismatch → reject
  p_idempotency_key       text   default null,
  p_actor                 text   default 'system'
) returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_store     commerce.stores;
  v_existing  commerce.orders;
  v_email     text := lower(trim(p_customer->>'email'));
  v_method    text := p_delivery->>'method';
  v_lines     jsonb;
  v_line      record;
  v_prod      commerce.products;
  v_short     jsonb := '[]';
  v_subtotal  bigint := 0;
  v_delivery  bigint := 0;
  v_total     bigint;
  v_cust_id   uuid;
  v_order_id  uuid;
  v_number    text;
  v_expires   timestamptz;
begin
  select * into v_store from stores where slug = p_store_slug;
  if not found then return jsonb_build_object('ok',false,'code','store_not_found'); end if;

  -- Idempotency: the same key always returns the same order.
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtext(v_store.id::text || ':' || p_idempotency_key));
    select * into v_existing from orders where store_id = v_store.id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok',true,'replayed',true,'order_id',v_existing.id,
        'order_number',v_existing.order_number,'total_cents',v_existing.total_cents,
        'currency',v_existing.currency,'reservation_expires_at',v_existing.reservation_expires_at);
    end if;
  end if;

  -- Input validation
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok',false,'code','invalid_email');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('ok',false,'code','invalid_items');
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where coalesce(e->>'sku','') = '' or coalesce(e->>'qty','') !~ '^[0-9]{1,2}$') then
    return jsonb_build_object('ok',false,'code','invalid_items');
  end if;
  -- merge duplicate SKUs
  select jsonb_agg(jsonb_build_object('sku',sku,'qty',qty)) into v_lines from (
    select upper(e->>'sku') sku, sum((e->>'qty')::int) qty from jsonb_array_elements(p_items) e group by 1
  ) s;
  if exists (select 1 from jsonb_array_elements(v_lines) l where (l->>'qty')::int not between 1 and 10) then
    return jsonb_build_object('ok',false,'code','invalid_quantity');
  end if;

  if v_method not in ('collect','courier') or v_method is null then
    return jsonb_build_object('ok',false,'code','invalid_delivery_method');
  end if;
  if v_method = 'courier' then
    if coalesce(p_delivery->>'line1','') = '' or coalesce(p_delivery->>'city','') = ''
       or coalesce(p_delivery->>'postal_code','') = '' then
      return jsonb_build_object('ok',false,'code','incomplete_address');
    end if;
    if v_store.flat_delivery_cents is null then
      -- v0.3: can't price shipping reliably → human task BEFORE taking payment.
      perform open_task(v_store.id, null, 'price_delivery', 'support', 'high',
        'Courier delivery requested but no delivery price is configured',
        'price_delivery:' || v_email, jsonb_build_object('email',v_email,'items',v_lines,'delivery',p_delivery));
      return jsonb_build_object('ok',false,'code','delivery_not_priced');
    end if;
    v_delivery := v_store.flat_delivery_cents;
  end if;

  -- Lock the product rows in a fixed order (prevents deadlocks; serialises last-unit races).
  perform 1 from products
   where store_id = v_store.id and sku in (select l->>'sku' from jsonb_array_elements(v_lines) l)
   order by id for update;

  for v_line in select l->>'sku' sku, (l->>'qty')::int qty from jsonb_array_elements(v_lines) l loop
    select * into v_prod from products where store_id = v_store.id and sku = v_line.sku;
    if not found or not v_prod.active then
      return jsonb_build_object('ok',false,'code','unknown_or_inactive_sku','sku',v_line.sku);
    end if;
    if v_prod.currency <> v_store.currency then
      return jsonb_build_object('ok',false,'code','currency_mismatch','sku',v_line.sku);
    end if;
    if available_qty(v_prod.id) < v_line.qty then
      v_short := v_short || jsonb_build_object('sku',v_line.sku,'requested',v_line.qty,
                                               'available',greatest(available_qty(v_prod.id),0));
    end if;
    v_subtotal := v_subtotal + v_prod.price_cents * v_line.qty;
  end loop;

  if jsonb_array_length(v_short) > 0 then
    return jsonb_build_object('ok',false,'code','insufficient_stock','lines',v_short);
  end if;

  v_total := v_subtotal + v_delivery;
  if p_expected_total_cents is not null and p_expected_total_cents <> v_total then
    return jsonb_build_object('ok',false,'code','total_changed','total_cents',v_total,
                              'subtotal_cents',v_subtotal,'delivery_cents',v_delivery);
  end if;

  insert into customers (store_id, email, name, phone)
  values (v_store.id, v_email, nullif(p_customer->>'name',''), nullif(p_customer->>'phone',''))
  on conflict (store_id, email) do update
     set name  = coalesce(excluded.name,  customers.name),
         phone = coalesce(excluded.phone, customers.phone)
  returning id into v_cust_id;

  v_number  := v_store.order_prefix || '-' || lpad(nextval('commerce.order_number_seq')::text, 6, '0');
  v_expires := now() + make_interval(mins => v_store.reservation_minutes);

  insert into orders (store_id, customer_id, order_number, idempotency_key, currency,
                      subtotal_cents, delivery_cents, total_cents, delivery, reservation_expires_at, created_by)
  values (v_store.id, v_cust_id, v_number, p_idempotency_key, v_store.currency,
          v_subtotal, v_delivery, v_total, p_delivery, v_expires, p_actor)
  returning id into v_order_id;

  insert into order_items (order_id, product_id, sku, name, unit_price_cents, qty, line_total_cents)
  select v_order_id, p.id, p.sku, p.name, p.price_cents, l.qty, p.price_cents * l.qty
    from (select x->>'sku' sku, (x->>'qty')::int qty from jsonb_array_elements(v_lines) x) l
    join products p on p.store_id = v_store.id and p.sku = l.sku;

  insert into stock_reservations (store_id, product_id, order_id, qty, status, expires_at)
  select v_store.id, oi.product_id, v_order_id, oi.qty, 'active', v_expires
    from order_items oi where oi.order_id = v_order_id;

  perform audit(v_store.id, 'order', v_order_id, 'created', p_actor, null, 'awaiting_payment',
                jsonb_build_object('order_number',v_number,'total_cents',v_total));

  return jsonb_build_object('ok',true,'replayed',false,'order_id',v_order_id,'order_number',v_number,
    'subtotal_cents',v_subtotal,'delivery_cents',v_delivery,'total_cents',v_total,
    'currency',v_store.currency,'reservation_expires_at',v_expires);
end $$;

-- 2) Start a payment attempt (one hosted checkout). Reuses a fresh pending
--    attempt on double-click; caps attempts at 5.
create function public.commerce_start_payment_attempt(p_order_id uuid, p_actor text default 'system')
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
  if v_order.status <> 'awaiting_payment' then
    return jsonb_build_object('ok',false,'code','order_not_payable','status',v_order.status);
  end if;
  if exists (select 1 from order_items oi where oi.order_id = v_order.id and not exists (
               select 1 from stock_reservations r where r.order_id = v_order.id and r.product_id = oi.product_id
                 and r.status = 'active' and r.expires_at > clock_timestamp() + interval '2 minutes')) then
    -- Hold expired (or about to): don't send the customer to pay for stock we no longer hold.
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

create function public.commerce_attach_checkout(p_attempt_id uuid, p_authorization_url text, p_access_code text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
begin
  update payment_attempts set authorization_url = p_authorization_url, access_code = p_access_code, updated_at = now()
   where id = p_attempt_id and status = 'pending';
  return jsonb_build_object('ok', found);
end $$;

-- Initialize call failed/timed out. 'unknown' = we don't know if Paystack created it;
-- reconciliation will ask Paystack by reference later. Only moves out of 'pending'.
create function public.commerce_mark_attempt(p_reference text, p_status text, p_error text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_att payment_attempts;
begin
  if p_status not in ('failed','unknown','cancelled') then
    return jsonb_build_object('ok',false,'code','invalid_status');
  end if;
  update payment_attempts set status = p_status, last_error = left(p_error, 500), updated_at = now()
   where reference = p_reference and status in ('pending','unknown') returning * into v_att;
  if not found then return jsonb_build_object('ok',false,'code','not_transitionable'); end if;
  perform audit(v_att.store_id, 'payment_attempt', v_att.id, 'marked', 'system', 'pending', p_status,
                jsonb_build_object('error', left(p_error, 200)));
  return jsonb_build_object('ok',true);
end $$;

-- 3) Record an inbound provider event exactly once.
create function public.commerce_record_payment_event(p_provider text, p_dedup_key text, p_event_type text,
                                                     p_reference text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_id bigint;
begin
  insert into payment_events (provider, dedup_key, event_type, reference, payload)
  values (p_provider, p_dedup_key, p_event_type, p_reference, p_payload)
  on conflict (dedup_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from payment_events where dedup_key = p_dedup_key;
    return jsonb_build_object('is_new',false,'event_id',v_id,
      'already_processed', (select processed_at is not null from payment_events where id = v_id));
  end if;
  return jsonb_build_object('is_new',true,'event_id',v_id,'already_processed',false);
end $$;

create function public.commerce_mark_event_processed(p_event_id bigint, p_outcome text)
returns void
language sql security definer set search_path = commerce, pg_temp as $$
  update payment_events set processed_at = now(), outcome = left(p_outcome, 100) where id = p_event_id;
$$;

-- 4) Apply a payment ONLY after the server has verified it with Paystack
--    (amount/currency here must come from the verify API, never the webhook body).
--    Idempotent: calling it twice with the same facts is a no-op the 2nd time.
create function public.commerce_apply_verified_payment(
  p_reference        text,
  p_provider_status  text,     -- Paystack verify data.status: success|failed|abandoned|reversed|...
  p_amount_cents     bigint,
  p_currency         text,
  p_provider_txn_id  text,
  p_source           text      -- 'webhook' | 'reconcile' | 'return_page'
) returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare
  v_att       payment_attempts;
  v_order     orders;
  v_store     stores;
  v_all_held  boolean;
  v_n         int;
  v_on_hold   boolean := false;
  v_short     jsonb := '[]';
  v_item      record;
begin
  select * into v_att from payment_attempts where reference = p_reference for update;
  if not found then
    -- Money may exist that we can't match: a human must look. One active task per reference.
    perform open_task((select id from stores order by created_at limit 1), null, 'payment_unknown_reference',
      'owner_finance', 'urgent', 'Provider reported a payment for a reference we did not issue',
      'unknownref:' || p_reference,
      jsonb_build_object('reference',p_reference,'status',p_provider_status,'amount_cents',p_amount_cents,
                         'currency',p_currency,'source',p_source));
    return jsonb_build_object('outcome','unknown_reference');
  end if;

  select * into v_order from orders where id = v_att.order_id for update;
  select * into v_store from stores where id = v_order.store_id;

  -- Non-success statuses
  if p_provider_status <> 'success' then
    if p_provider_status = 'failed' and v_att.status in ('pending','unknown') then
      update payment_attempts set status = 'failed', updated_at = now() where id = v_att.id;
      perform audit(v_order.store_id, 'payment_attempt', v_att.id, 'failed', p_source, v_att.status, 'failed', '{}');
      return jsonb_build_object('outcome','attempt_failed');
    elsif p_provider_status = 'abandoned' and v_att.status in ('pending','unknown')
          and v_att.created_at < now() - interval '2 hours' then
      -- Stop polling it. If the customer still pays later, the webhook moves it to succeeded.
      update payment_attempts set status = 'cancelled', updated_at = now() where id = v_att.id;
      perform audit(v_order.store_id, 'payment_attempt', v_att.id, 'abandoned', p_source, v_att.status, 'cancelled', '{}');
      return jsonb_build_object('outcome','attempt_abandoned');
    elsif p_provider_status = 'reversed' and v_att.status = 'succeeded' then
      perform add_flag(v_order.id, 'payment_reversed');
      perform open_task(v_order.store_id, v_order.id, 'payment_reversed', 'owner_finance', 'urgent',
        'A succeeded payment was reported as reversed', 'reversed:' || v_att.id,
        jsonb_build_object('reference',p_reference));
      return jsonb_build_object('outcome','reversal_flagged');
    end if;
    return jsonb_build_object('outcome','not_successful','provider_status',p_provider_status);
  end if;

  -- Success, but already applied → no-op (duplicate / out-of-order events land here).
  if v_att.status = 'succeeded' then return jsonb_build_object('outcome','duplicate'); end if;
  if v_att.status = 'mismatch_held' then return jsonb_build_object('outcome','already_held'); end if;

  -- Amount / currency must match what we asked for, to the cent.
  if p_amount_cents is distinct from v_att.amount_cents or upper(p_currency) is distinct from v_att.currency then
    update payment_attempts set status = 'mismatch_held', received_amount_cents = p_amount_cents,
           received_currency = p_currency, provider_txn_id = p_provider_txn_id, verified_at = now(), updated_at = now()
     where id = v_att.id;
    perform add_flag(v_order.id, 'payment_mismatch');
    perform open_task(v_order.store_id, v_order.id, 'payment_mismatch', 'owner_finance', 'urgent',
      'Verified payment amount/currency does not match the order', 'mismatch:' || v_att.id,
      jsonb_build_object('reference',p_reference,'expected_cents',v_att.amount_cents,'expected_currency',v_att.currency,
                         'received_cents',p_amount_cents,'received_currency',p_currency));
    perform audit(v_order.store_id, 'payment_attempt', v_att.id, 'mismatch_held', p_source, v_att.status, 'mismatch_held',
                  jsonb_build_object('received_cents',p_amount_cents,'received_currency',p_currency));
    return jsonb_build_object('outcome','mismatch_held');
  end if;

  -- Money is real and correct: record it on the attempt no matter what happens next.
  update payment_attempts set status = 'succeeded', received_amount_cents = p_amount_cents,
         received_currency = upper(p_currency), provider_txn_id = p_provider_txn_id,
         verified_at = now(), updated_at = now()
   where id = v_att.id;
  perform audit(v_order.store_id, 'payment_attempt', v_att.id, 'succeeded', p_source, v_att.status, 'succeeded',
                jsonb_build_object('reference',p_reference,'amount_cents',p_amount_cents));

  if v_order.status in ('confirmed','completed') then
    perform add_flag(v_order.id, 'duplicate_payment');
    perform open_task(v_order.store_id, v_order.id, 'duplicate_payment', 'owner_finance', 'urgent',
      'Order was paid more than once (separate attempts)', 'dup:' || v_att.id,
      jsonb_build_object('reference',p_reference));
    return jsonb_build_object('outcome','duplicate_payment');
  end if;
  if v_order.status = 'cancelled' then
    perform add_flag(v_order.id, 'paid_after_cancel');
    perform open_task(v_order.store_id, v_order.id, 'paid_after_cancel', 'owner_finance', 'urgent',
      'Payment received for a cancelled order', 'paidcancel:' || v_att.id, jsonb_build_object('reference',p_reference));
    return jsonb_build_object('outcome','paid_after_cancel');
  end if;

  -- awaiting_payment → confirmed. Convert holds to allocations, or revalidate if holds lapsed.
  -- Locking (Codex review P1): take the SAME product locks as commerce_create_order, in the
  -- same id order, so a new order for these SKUs waits until we commit and then sees our
  -- allocation. Then lock this order's own holds, so the expiry worker cannot release them
  -- between our check and our update. Lock order everywhere: products → reservations.
  perform 1 from products where id in (select product_id from order_items where order_id = v_order.id)
   order by id for update;
  perform 1 from stock_reservations where order_id = v_order.id order by id for update;

  select bool_and(exists (select 1 from stock_reservations r where r.order_id = v_order.id
                            and r.product_id = oi.product_id and r.status = 'active'
                            and r.expires_at > clock_timestamp() and r.qty = oi.qty))
    into v_all_held from order_items oi where oi.order_id = v_order.id;

  if v_all_held then
    update stock_reservations set status = 'allocated', updated_at = now()
     where order_id = v_order.id and status = 'active' and expires_at > clock_timestamp();
    get diagnostics v_n = row_count;
    if v_n <> (select count(*) from order_items where order_id = v_order.id) then
      -- Should be impossible with the locks above. If it ever happens, roll back everything:
      -- the webhook returns 500 and Paystack / the reconciler retries on a clean state.
      raise exception 'allocation mismatch for order % (% of % lines)', v_order.order_number, v_n,
        (select count(*) from order_items where order_id = v_order.id);
    end if;
  else
    -- Late payment: release whatever is left of our holds, then re-check stock (products already locked).
    update stock_reservations set status = 'released', updated_at = now()
     where order_id = v_order.id and status = 'active';
    for v_item in select oi.product_id, oi.sku, oi.qty from order_items oi where oi.order_id = v_order.id loop
      if available_qty(v_item.product_id) < v_item.qty then
        v_short := v_short || jsonb_build_object('sku',v_item.sku,'qty',v_item.qty,
                                                 'available',greatest(available_qty(v_item.product_id),0));
      end if;
    end loop;
    if jsonb_array_length(v_short) = 0 then
      insert into stock_reservations (store_id, product_id, order_id, qty, status, expires_at)
      select v_order.store_id, oi.product_id, v_order.id, oi.qty, 'allocated', now()
        from order_items oi where oi.order_id = v_order.id;
      perform audit(v_order.store_id, 'order', v_order.id, 'late_payment_restocked', p_source, null, null, '{}');
    else
      v_on_hold := true;   -- never oversell; never pretend the money didn't arrive
      perform add_flag(v_order.id, 'stock_unavailable_after_payment');
      perform open_task(v_order.store_id, v_order.id, 'stock_unavailable_after_payment', 'owner_finance', 'urgent',
        'Paid after the stock hold expired and the stock is gone — refund or source stock',
        'latestock:' || v_order.id, jsonb_build_object('short',v_short,'reference',p_reference));
    end if;
  end if;

  update orders set status = 'confirmed', paid_at = now(),
         fulfilment_status = case when v_on_hold then 'on_hold' else 'ready_to_pack' end,
         updated_at = now()
   where id = v_order.id;
  perform audit(v_order.store_id, 'order', v_order.id, 'paid', p_source, 'awaiting_payment', 'confirmed',
                jsonb_build_object('reference',p_reference,'on_hold',v_on_hold));

  if not v_on_hold then
    perform open_task(v_order.store_id, v_order.id, 'pack_order', 'fulfilment', 'high',
      'Paid order ready for packing', 'pack:' || v_order.id,
      jsonb_build_object('order_number',v_order.order_number,'delivery',v_order.delivery,
        'items',(select jsonb_agg(jsonb_build_object('sku',sku,'name',name,'qty',qty)) from order_items where order_id = v_order.id)));
  end if;

  perform enqueue_job(v_order.store_id, 'notify_owner_paid_order', 'notify_paid:' || v_order.id,
    jsonb_build_object('order_number',v_order.order_number,'total_cents',v_order.total_cents,
                       'currency',v_order.currency,'on_hold',v_on_hold));

  return jsonb_build_object('outcome','applied','order_number',v_order.order_number,'on_hold',v_on_hold);
end $$;

-- 5) Housekeeping: mark lapsed holds as released (availability already ignores them;
--    this keeps the ledger tidy). Run by pg_cron every minute (002 script).
create function public.commerce_release_expired_reservations()
returns integer
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_n int;
begin
  update stock_reservations set status = 'released', updated_at = now()
   where status = 'active' and expires_at <= clock_timestamp();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 6) Attempts the reconciler should re-check with Paystack (missed/late webhooks).
--    Fair rotation (Codex review P2): never-checked first, then least-recently-checked,
--    and each returned attempt is stamped as checked — so every eligible attempt gets its
--    turn, whatever the outcome of the check (found, not found, or error).
--    SKIP LOCKED: two overlapping worker runs never check the same attempt at once.
create function public.commerce_list_reconcilable_attempts(p_limit int default 10)
returns table (reference text, status text, created_at timestamptz)
language sql security definer set search_path = commerce, pg_temp as $$
  update payment_attempts a set last_checked_at = clock_timestamp()
   where a.id in (
     select x.id from payment_attempts x
      where x.status in ('pending','unknown')
        and x.created_at < now() - interval '3 minutes'
        and x.created_at > now() - interval '48 hours'
      order by x.last_checked_at nulls first, x.created_at
      limit least(p_limit, 50)
      for update skip locked)
  returning a.reference, a.status, a.created_at;
$$;

-- Hand back attempts the worker claimed but ran out of time to check: front of the queue next run.
create function public.commerce_unclaim_reconcile(p_references text[])
returns void
language sql security definer set search_path = commerce, pg_temp as $$
  update payment_attempts set last_checked_at = null
   where reference = any(p_references) and status in ('pending','unknown');
$$;

-- 7) Outbox: claim due jobs (skip-locked, reclaims jobs stuck > 10 min), then complete.
create function public.commerce_claim_jobs(p_limit int default 10)
returns table (id bigint, kind text, payload jsonb, attempts integer)
language sql security definer set search_path = commerce, pg_temp as $$
  update jobs j set status = 'running', attempts = j.attempts + 1, locked_at = now(), updated_at = now()
   where j.id in (
     select x.id from jobs x
      where (x.status = 'pending' and x.run_after <= now())
         or (x.status = 'running' and x.locked_at < now() - interval '10 minutes')
      order by x.id limit least(p_limit, 25)
      for update skip locked)
  returning j.id, j.kind, j.payload, j.attempts;
$$;

create function public.commerce_complete_job(p_job_id bigint, p_ok boolean, p_error text default null, p_skipped boolean default false)
returns void
language plpgsql security definer set search_path = commerce, pg_temp as $$
begin
  update jobs set
    status = case when p_ok then (case when p_skipped then 'skipped' else 'done' end)
                  when attempts >= max_attempts then 'dead' else 'pending' end,
    run_after = case when p_ok then run_after
                     else now() + make_interval(mins => least(power(2, attempts)::int, 240)) end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    locked_at = null, updated_at = now()
  where id = p_job_id and status = 'running';
end $$;

-- 8) Owner fulfilment actions (Milestone 1: run from SQL editor; Phase 2 dashboard calls them).
create function public.commerce_owner_mark_packed(p_order_number text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_order orders;
begin
  select * into v_order from orders where order_number = p_order_number for update;
  if not found then return jsonb_build_object('ok',false,'code','order_not_found'); end if;
  if v_order.status <> 'confirmed' or v_order.fulfilment_status not in ('ready_to_pack','packing') then
    return jsonb_build_object('ok',false,'code','invalid_transition','status',v_order.status,
                              'fulfilment_status',v_order.fulfilment_status);
  end if;
  update orders set fulfilment_status = 'packed', updated_at = now() where id = v_order.id;
  update handoff_tasks set status = 'in_progress', updated_at = now()
   where active_key = 'pack:' || v_order.id and status not in ('resolved','cancelled');
  perform audit(v_order.store_id, 'order', v_order.id, 'packed', p_actor, v_order.fulfilment_status, 'packed', '{}');
  return jsonb_build_object('ok',true);
end $$;

create function public.commerce_owner_mark_handed_to_courier(p_order_number text, p_courier text,
                                                             p_tracking_ref text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_order orders; v_r record;
begin
  select * into v_order from orders where order_number = p_order_number for update;
  if not found then return jsonb_build_object('ok',false,'code','order_not_found'); end if;
  if v_order.fulfilment_status <> 'packed' then
    return jsonb_build_object('ok',false,'code','invalid_transition','fulfilment_status',v_order.fulfilment_status);
  end if;
  if coalesce(trim(p_courier),'') = '' then return jsonb_build_object('ok',false,'code','courier_required'); end if;

  -- The ONE place physical stock leaves: allocated → consumed, on_hand decremented once.
  -- Same lock order as everywhere else: products (id order) → reservations.
  perform 1 from products where id in (select product_id from order_items where order_id = v_order.id)
   order by id for update;
  for v_r in select r.id, r.product_id, r.qty from stock_reservations r
              where r.order_id = v_order.id and r.status = 'allocated' order by r.product_id for update loop
    update products set on_hand = on_hand - v_r.qty, updated_at = now() where id = v_r.product_id;
    update stock_reservations set status = 'consumed', updated_at = now() where id = v_r.id;
  end loop;

  update orders set fulfilment_status = 'handed_to_courier', courier_name = trim(p_courier),
         courier_tracking_ref = nullif(trim(p_tracking_ref),''), updated_at = now()
   where id = v_order.id;
  update handoff_tasks set status = 'resolved', resolved_at = now(), updated_at = now(),
         resolution = 'Handed to ' || trim(p_courier)
   where active_key = 'pack:' || v_order.id and status not in ('resolved','cancelled');
  perform audit(v_order.store_id, 'order', v_order.id, 'handed_to_courier', p_actor, 'packed', 'handed_to_courier',
                jsonb_build_object('courier',p_courier,'tracking_ref',p_tracking_ref));
  return jsonb_build_object('ok',true);
end $$;

create function public.commerce_owner_mark_completed(p_order_number text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = commerce, pg_temp as $$
declare v_order orders;
begin
  select * into v_order from orders where order_number = p_order_number for update;
  if not found then return jsonb_build_object('ok',false,'code','order_not_found'); end if;
  if v_order.fulfilment_status <> 'handed_to_courier' then
    return jsonb_build_object('ok',false,'code','invalid_transition','fulfilment_status',v_order.fulfilment_status);
  end if;
  update orders set fulfilment_status = 'completed', status = 'completed', updated_at = now() where id = v_order.id;
  perform audit(v_order.store_id, 'order', v_order.id, 'completed', p_actor, 'confirmed', 'completed', '{}');
  return jsonb_build_object('ok',true);
end $$;

-- 9) Owner overview for the test page / future dashboard.
create function public.commerce_owner_overview(p_store_slug text)
returns jsonb
language sql stable security definer set search_path = commerce, pg_temp as $$
  select jsonb_build_object(
    'store', (select jsonb_build_object('name',s.name,'currency',s.currency,
                     'flat_delivery_cents',s.flat_delivery_cents,'reservation_minutes',s.reservation_minutes)
                from stores s where s.slug = p_store_slug),
    'products', coalesce((select jsonb_agg(jsonb_build_object('sku',p.sku,'name',p.name,'price_cents',p.price_cents,
                     'on_hand',p.on_hand,'available',available_qty(p.id),'active',p.active) order by p.sku)
                from products p join stores s on s.id = p.store_id where s.slug = p_store_slug), '[]'),
    'orders', coalesce((select jsonb_agg(o order by o->>'created_at' desc) from (
                select jsonb_build_object('order_number',o.order_number,'status',o.status,
                       'fulfilment_status',o.fulfilment_status,'total_cents',o.total_cents,'currency',o.currency,
                       'flags',o.exception_flags,'created_at',o.created_at,'paid_at',o.paid_at,
                       'email',c.email) o
                  from orders o join customers c on c.id = o.customer_id join stores s on s.id = o.store_id
                 where s.slug = p_store_slug order by o.created_at desc limit 25) x(o)), '[]'),
    'open_tasks', coalesce((select jsonb_agg(jsonb_build_object('kind',t.kind,'role',t.role,'assignee',t.assignee,
                       'priority',t.priority,'status',t.status,'reason',t.reason,'created_at',t.created_at,
                       'order_number',(select order_number from orders where id = t.order_id)) order by t.created_at desc)
                from handoff_tasks t join stores s on s.id = t.store_id
               where s.slug = p_store_slug and t.status not in ('resolved','cancelled')), '[]')
  );
$$;

-- ─── Lock down: only the server (service_role) may call the API functions ──
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

-- Internal helpers: nobody but the owner (postgres) runs these directly.
revoke all on all functions in schema commerce from public;
