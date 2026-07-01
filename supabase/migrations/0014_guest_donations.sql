-- ============================================================
--  0014 — guest donations
-- ============================================================
--  Public users can donate without an account. A purchase may now
--  have no donor_id; instead it carries the guest's name + email (for
--  the receipt). All the reporting views/functions are updated to fall
--  back to the guest name when there's no linked donor.
-- ============================================================

alter table public.purchases
    alter column donor_id drop not null;

alter table public.purchases
    add column if not exists guest_name  text,
    add column if not exists guest_email text;

-- Either a donor or guest contact must be present.
alter table public.purchases
    drop constraint if exists purchases_donor_or_guest;
alter table public.purchases
    add constraint purchases_donor_or_guest
    check (donor_id is not null or guest_email is not null);

-- ------------------------------------------------------------
--  Reporting: fall back to guest_name when donor_id is null.
-- ------------------------------------------------------------
create or replace view public.public_donations as
select
    coalesce(nullif(trim(d.name), ''), nullif(trim(pu.guest_name), ''),
             'Anonymous donor')                as donor_name,
    coalesce(i.title, 'an item')               as item_title,
    pu.quantity,
    pu.amount,
    pu.created_at
from public.purchases pu
join public.campaigns c on c.id = pu.campaign_id and c.status = 'live'
left join public.donors d on d.id = pu.donor_id
left join public.items  i on i.id = pu.item_id
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
    order by c.title, pu.created_at desc;
$$;
grant execute on function public.all_donations_report() to authenticated;
