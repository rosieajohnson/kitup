-- ============================================================
--  0011 — public "recent supporters" feed
-- ============================================================
--  Exposes donations on LIVE campaigns to everyone (for a public
--  supporters feed on the homepage). Like the funding views in 0003,
--  this is a view owned by a privileged role, so it can read across
--  the RLS-protected purchases/donors tables and publish the result.
--
--  It deliberately exposes the donor's display NAME publicly (plus the
--  item + amount) — never email or address. Only live campaigns are
--  included; drafts stay private.
-- ============================================================

create or replace view public.public_donations as
select
    coalesce(nullif(trim(d.name), ''), 'Anonymous donor') as donor_name,
    coalesce(i.title, 'an item')                          as item_title,
    pu.quantity,
    pu.amount,
    pu.created_at
from public.purchases pu
join public.campaigns c on c.id = pu.campaign_id and c.status = 'live'
left join public.donors d on d.id = pu.donor_id
left join public.items  i on i.id = pu.item_id
order by pu.created_at desc;

grant select on public.public_donations to anon, authenticated;
