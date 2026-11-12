-- ============================================================
--  0041 — second product image (in-use / alternate shot)
-- ============================================================
--  Adds a second image to catalogue products so the picker + campaign page can
--  show a click-through: primary = clean product shot (Hart's first photo),
--  image_url_2 = the alternate (often the product in use). Populated from the
--  Hart Sport Shopify catalogue's images[] via `npm run sync:images2`, which
--  self-hosts each as /hart/<sku>-2.webp.
--  After applying + running the sync, flip IMAGE2_COLUMN_READY -> true in
--  lib/data.ts.
-- ============================================================

alter table public.hart_sport_products
    add column if not exists image_url_2 text;
