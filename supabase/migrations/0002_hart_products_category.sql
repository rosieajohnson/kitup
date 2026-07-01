-- ============================================================
--  0002 — reconcile hart_sport_products with the catalogue importer
-- ============================================================
--  The approved schema (0001_init.sql) defines hart_sport_products
--  WITHOUT a `category` column, but the provided import script
--  (scripts/import_catalogue.py) and CSV template both populate a
--  `category` field. Without this column the importer's upsert fails.
--
--  This additive migration adds the column so the catalogue importer,
--  the CSV template, and the app UI (which groups items by category)
--  all agree. It changes nothing else in the approved schema.
--
--  If you instead want to drop category everywhere, remove it from
--  scripts/import_catalogue.py and the CSV header and skip this file.
-- ============================================================

alter table public.hart_sport_products
    add column if not exists category text;

create index if not exists hart_sport_products_category_idx
    on public.hart_sport_products (category);
