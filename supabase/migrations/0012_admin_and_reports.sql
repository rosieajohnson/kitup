-- ============================================================
--  0012 — admin role (ASF) + campaign donation reports
-- ============================================================
--  ASF owns the platform/Stripe account and needs to see EVERY
--  campaign's donations; schools see only their own. We add an
--  is_admin flag and SECURITY DEFINER report functions that gate
--  access: per-campaign report = owning school OR admin; the master
--  report and admin campaign list = admin only.
--
--  Reports expose donor NAME + item + amount (never email/address).
-- ============================================================

alter table public.profiles
    add column if not exists is_admin boolean not null default false;

-- Is the caller an admin (ASF)?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select p.is_admin from public.profiles p where p.id = auth.uid()),
        false
    );
$$;
grant execute on function public.is_admin() to authenticated;

-- One campaign's donations — for the owning school OR an admin.
create or replace function public.campaign_report(p_campaign_id uuid)
returns table (
    campaign_title text,
    school_name    text,
    donor_name     text,
    item_title     text,
    quantity       int,
    amount         numeric(12,2),
    donated_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
    select c.title,
           s.school,
           coalesce(nullif(trim(d.name), ''), 'Anonymous donor'),
           coalesce(i.title, 'an item'),
           pu.quantity,
           pu.amount,
           pu.created_at
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

-- Every donation across every campaign — admin (ASF) only.
create or replace function public.all_donations_report()
returns table (
    campaign_title text,
    school_name    text,
    donor_name     text,
    item_title     text,
    quantity       int,
    amount         numeric(12,2),
    donated_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
    select c.title,
           s.school,
           coalesce(nullif(trim(d.name), ''), 'Anonymous donor'),
           coalesce(i.title, 'an item'),
           pu.quantity,
           pu.amount,
           pu.created_at
    from public.purchases pu
    join public.campaigns c on c.id = pu.campaign_id
    join public.schools   s on s.id = c.school_id
    left join public.donors d on d.id = pu.donor_id
    left join public.items  i on i.id = pu.item_id
    where public.is_admin()
    order by c.title, pu.created_at desc;
$$;
grant execute on function public.all_donations_report() to authenticated;

-- All campaigns with totals — admin (ASF) only — for the admin console.
create or replace function public.admin_campaign_list()
returns table (
    campaign_id    uuid,
    campaign_title text,
    school_name    text,
    status         public.campaign_status,
    funding_goal   numeric(12,2),
    amount_raised  numeric(12,2),
    donation_count bigint,
    deadline       timestamptz
)
language sql
security definer
set search_path = public
as $$
    select c.id,
           c.title,
           s.school,
           c.status,
           c.funding_goal,
           coalesce(sum(pu.amount), 0)::numeric(12,2),
           count(pu.id),
           c.deadline
    from public.campaigns c
    join public.schools s on s.id = c.school_id
    left join public.purchases pu on pu.campaign_id = c.id
    where public.is_admin()
    group by c.id, c.title, s.school, c.status, c.funding_goal, c.deadline, c.created_at
    order by c.created_at desc;
$$;
grant execute on function public.admin_campaign_list() to authenticated;
