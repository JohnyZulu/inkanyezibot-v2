-- ════════════════════════════════════════════════════════════════════════════
-- Inkanyezi Commerce — test store + placeholder catalogue (TEST MODE ONLY)
-- File: supabase/003_seed_test_store.sql
--
-- Edit the values marked ✏️ before running if you like, then SQL Editor → Run.
-- These are PLACEHOLDER products for Paystack test payments — not your real
-- catalogue (D8 watches-vs-perfume is still open). Replace them later.
-- ════════════════════════════════════════════════════════════════════════════

insert into commerce.stores (slug, name, currency, order_prefix, owner_name, flat_delivery_cents, reservation_minutes)
values (
  'inkanyezi-test',          -- slug used by the app (COMMERCE_STORE_SLUG env var)
  'Inkanyezi Test Store',    -- ✏️ display name
  'ZAR',
  'INK',                     -- order numbers look like INK-001001
  'Sanele',                  -- ✏️ named assignee on owner tasks
  null,                      -- ✏️ D17: courier delivery price in CENTS (e.g. 9900 = R99.00). NULL = courier refused + task.
  30                         -- minutes a checkout holds stock
);

insert into commerce.products (store_id, sku, name, description, price_cents, currency, on_hand)
select s.id, v.sku, v.name, v.description, v.price_cents, 'ZAR', v.on_hand
from commerce.stores s,
  (values
    ('TEST-WATCH-01', 'Test Watch — Steel',  'Placeholder product for test payments', 125000, 3),  -- R1 250.00, 3 in stock
    ('TEST-WATCH-02', 'Test Watch — Gold',   'Placeholder product for test payments', 249900, 2),  -- R2 499.00
    ('TEST-LAST-01',  'Test Item — 1 left',  'Use this to try the last-unit race',     50000, 1)   -- R500.00, ONE unit
  ) as v(sku, name, description, price_cents, on_hand)
where s.slug = 'inkanyezi-test';

-- Check:
select sku, name, price_cents, on_hand from commerce.products order by sku;
