-- ============================================================
--  0015 — refunds free the item up again
-- ============================================================
--  When a payment is refunded in Stripe, the webhook marks the
--  matching purchase(s) refunded (refunded_at). Refunded rows are
--  kept for the record but excluded from every funding total and
--  donor view, so the item becomes available to fund again.
-- ============================================================

alter table public.purchases
    add column if not exists refunded_at timestamptz;

create index if not exists purchases_refunded_at_idx
    on public.purchases (refunded_at);

-- ---- funding totals: only count non-refunded purchases ----
create or replace view public.campaign_funding as
select campaign_id,
       coalesce(sum(amount), 0)::numeric(12,2) as amount_raised,
       count(*)                                as donation_count
from public.purchases
where refunded_at is null
group by campaign_id;

create or replace view public.item_funding as
select item_id,
       coalesce(sum(quantity), 0)::int         as quantity_funded,
       coalesce(sum(amount), 0)::numeric(12,2) as amount_raised
from public.purchases
where refunded_at is null
group by item_id;

grant select on public.campaign_funding to anon, authenticated;
grant select on public.item_funding     to anon, authenticated;

-- ---- donor views/reports: exclude refunded ----
create or replace view public.public_donations as
select
    coalesce(nullif(trim(d.name), ''), nullif(trim(pu.guest_name), ''),
             'Anonymous donor')                as donor_name,
    coalesce(i.title, 'an item')               as item_title,
    pu.quantity, pu.amount, pu.created_at
from public.purchases pu
join public.campaigns c on c.id = pu.campaign_id and c.status = 'live'
left join public.donors d on d.id = pu.donor_id
left join public.items  i on i.id = pu.item_id
where pu.refunded_at is null
order by pu.created_at desc;

grant select on public.public_donations to anon, authenticated;

create or replace function public.campaign_donations(p_campaign_id uuid)
returns table (
    donor_name text, item_title text, quantity int,
    amount numeric(12,2), created_at timestamptz
)
language sql security definer set search_path = public as $$
    select coalesce(nullif(trim(d.name), ''), nullif(trim(pu.guest_name), ''),
                    'Anonymous donor'),
           coalesce(i.title, 'an item'),
           pu.quantity, pu.amount, pu.created_at
    from public.purchases pu
    join public.campaigns c on c.id = pu.campaign_id
    left join public.donors d on d.id = pu.donor_id
    left join public.items  i on i.id = pu.item_id
    where pu.campaign_id = p_campaign_id
      and pu.refunded_at is null
      and (c.school_id = auth.uid() or public.is_admin())
    order by pu.created_at desc;
$$;
grant execute on function public.campaign_donations(uuid) to authenticated;

create or replace function public.campaign_report(p_campaign_id uuid)
returns table (
    campaign_title text, school_name text, donor_name text, item_title text,
    quantity int, amount numeric(12,2), donated_at timestamptz
)
language sql security definer set search_path = public as $$
    select c.title, s.school,
           coalesce(nullif(trim(d.name), ''), nullif(trim(pu.guest_name), ''),
                    'Anonymous donor'),
           coalesce(i.title, 'an item'),
           pu.quantity, pu.amount, pu.created_at
    from public.purchases pu
    join public.campaigns c on c.id = pu.campaign_id
    join public.schools   s on s.id = c.school_id
    left join public.donors d on d.id = pu.donor_id
    left join public.items  i on i.id = pu.item_id
    where pu.campaign_id = p_campaign_id
      and pu.refunded_at is null
      and (c.school_id = auth.uid() or public.is_admin())
    order by pu.created_at desc;
$$;
grant execute on function public.campaign_report(uuid) to authenticated;

create or replace function public.all_donations_report()
returns table (
    campaign_title text, school_name text, donor_name text, item_title text,
    quantity int, amount numeric(12,2), donated_at timestamptz
)
language sql security definer set search_path = public as $$
    select c.title, s.school,
           coalesce(nullif(trim(d.name), ''), nullif(trim(pu.guest_name), ''),
                    'Anonymous donor'),
           coalesce(i.title, 'an item'),
           pu.quantity, pu.amount, pu.created_at
    from public.purchases pu
    join public.campaigns c on c.id = pu.campaign_id
    join public.schools   s on s.id = c.school_id
    left join public.donors d on d.id = pu.donor_id
    left join public.items  i on i.id = pu.item_id
    where public.is_admin()
      and pu.refunded_at is null
    order by c.title, pu.created_at desc;
$$;
grant execute on function public.all_donations_report() to authenticated;
