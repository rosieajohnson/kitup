-- ============================================================
--  0040 — product descriptions (incl. set/pack contents)
-- ============================================================
--  Adds a description to catalogue products, populated from the Hart Sport
--  Shopify catalogue (body_html, cleaned to text) via
--  `npm run import:descriptions`. Shown on the public campaign item so donors
--  can see what a product is — in particular, how many of what is in a set/pack.
--  After applying, flip DESCRIPTION_COLUMN_READY -> true in lib/data.ts.
-- ============================================================

alter table public.hart_sport_products
    add column if not exists description text;
