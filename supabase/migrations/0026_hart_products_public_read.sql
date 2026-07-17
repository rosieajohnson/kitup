-- ============================================================
--  0026 — make the Hart catalogue publicly readable
-- ============================================================
--  The campaign page is public-facing: signed-out donors need to see each
--  item's product details (name, price and now image_url). The original
--  policy (0001) restricted SELECT to authenticated users, so anonymous
--  visitors got a null product embed — no photo, no product link.
--
--  The catalogue is non-sensitive reference data (public Hart Sport product
--  info), so open SELECT to everyone, matching how public.items is exposed.
--  Writes remain service-role only (no write policy is granted here).
-- ============================================================

drop policy if exists "catalog readable by authenticated"
    on public.hart_sport_products;

drop policy if exists "hart products publicly readable"
    on public.hart_sport_products;

create policy "hart products publicly readable"
    on public.hart_sport_products for select using (true);
