-- ============================================================
--  0003 — public funding totals
-- ============================================================
--  The app shows "$X raised" on every campaign and "N/M funded" on
--  every item. Those numbers come from public.purchases, but the
--  purchases RLS policy only lets the donor or the owning school
--  read individual rows — so an anonymous visitor summing purchases
--  directly would see zero everywhere.
--
--  These two views expose ONLY the aggregate totals (sums/counts),
--  never individual donations or donor identity, and are readable by
--  everyone. The underlying purchases table stays locked down.
--
--  Note: like any aggregate view over an RLS table, these are owned
--  by a role that can read all purchases, which is the intended
--  behaviour here (we are publishing sums on purpose). Supabase's
--  linter may flag the views — that is expected for this pattern.
-- ============================================================

-- Per-campaign money raised.
create or replace view public.campaign_funding as
select
    campaign_id,
    coalesce(sum(amount), 0)::numeric(12,2) as amount_raised,
    count(*)                                as donation_count
from public.purchases
group by campaign_id;

-- Per-item units funded and money raised.
create or replace view public.item_funding as
select
    item_id,
    coalesce(sum(quantity), 0)::int          as quantity_funded,
    coalesce(sum(amount), 0)::numeric(12,2)  as amount_raised
from public.purchases
group by item_id;

-- Let the app (anon + signed-in) read the aggregates.
grant select on public.campaign_funding to anon, authenticated;
grant select on public.item_funding     to anon, authenticated;
