-- ============================================================
--  0005 — seed a curated slice of the Hart Sport catalogue
-- ============================================================
--  Real products read directly from the 2026 Hart Sport Buyer's
--  Guide (accurate SKU, name, category, price ex-variants). This is
--  a deliberately small, verified set so campaign creation can be
--  tested with genuine gear — NOT the full 5,500-product catalogue,
--  which should come from a Hart data/CSV export, not the print PDF.
--
--  product_url is left null: the print catalogue has no per-product
--  links. The UI handles a null URL.
--
--  Idempotent: upserts on hart_sku, so re-running refreshes prices
--  rather than duplicating.
-- ============================================================

insert into public.hart_sport_products (hart_sku, name, category, unit_price)
values
    -- Basketball
    ('4-227', 'HART Atomic Basketball (Size 7)',        'Basketball', 75.00),
    ('4-226', 'HART Atomic Basketball (Size 6)',        'Basketball', 75.00),
    ('4-230', 'HART 7000 Super Basketball (Size 7)',    'Basketball', 99.00),
    ('4-231', 'HART 7000 Super Basketball (Size 6)',    'Basketball', 99.00),
    ('4-229', 'HART Atomic Basketball Pack (Size 7)',   'Basketball', 359.00),
    ('4-228', 'HART Atomic Basketball Pack (Size 6)',   'Basketball', 359.00),
    ('4-235', 'HART 7000 Super Basketball Pack (Size 7)', 'Basketball', 469.00),
    ('4-236', 'HART 7000 Super Basketball Pack (Size 6)', 'Basketball', 469.00),

    -- Baseball, Softball & T-ball
    ('5-929', 'HART T-Ball Kit',                  'Baseball, Softball & T-ball', 999.00),
    ('5-927', 'HART Club Baseball Kit (Senior)',  'Baseball, Softball & T-ball', 1669.00),
    ('5-928', 'HART Club Baseball Kit (Junior)',  'Baseball, Softball & T-ball', 1555.00),
    ('5-920', 'HART Ultra Softball Kit',          'Baseball, Softball & T-ball', 1859.00),
    ('5-922', 'HART Club Softball Kit (Senior)',  'Baseball, Softball & T-ball', 1599.00),
    ('5-923', 'HART Club Softball Kit (Junior)',  'Baseball, Softball & T-ball', 1479.00),
    ('5-924', 'HART Softball Kit (Senior)',       'Baseball, Softball & T-ball', 1579.00),
    ('5-925', 'HART Softball Kit (Junior)',       'Baseball, Softball & T-ball', 1445.00),

    -- Archery
    ('1-700', 'HART Layered Foam Archery Target', 'Archery', 579.00),
    ('1-716', 'HART Archery Target Easel',        'Archery', 399.00)
on conflict (hart_sku) do update
    set name       = excluded.name,
        category   = excluded.category,
        unit_price = excluded.unit_price,
        synced_at  = now();
