-- ============================================================
--  0016 — anonymous donations
-- ============================================================
--  Donors/guests can opt to make a donation anonymous. When set, the
--  public "Recent supporters" feed and the campaign's "Who's funded
--  this" list show "Anonymous" instead of the name. (The school/ASF
--  reports still show the real name for record-keeping.)
-- ============================================================

alter table public.purchases
    add column if not exists anonymous boolean not null default false;

-- Public supporters feed.
create or replace view public.public_donations as
select
    case
        when pu.anonymous then 'Anonymous'
        else coalesce(nullif(trim(d.name), ''), nullif(trim(pu.guest_name), ''),
                      'Anonymous donor')
    end                                        as donor_name,
    coalesce(i.title, 'an item')               as item_title,
    pu.quantity, pu.amount, pu.created_at
from public.purchases pu
join public.campaigns c on c.id = pu.campaign_id and c.status = 'live'
left join public.donors d on d.id = pu.donor_id
left join public.items  i on i.id = pu.item_id
where pu.refunded_at is null
order by pu.created_at desc;

grant select on public.public_donations to anon, authenticated;

-- Campaign "Who's funded this" (shown to the owning school).
create or replace function public.campaign_donations(p_campaign_id uuid)
returns table (
    donor_name text, item_title text, quantity int,
    amount numeric(12,2), created_at timestamptz
)
language sql security definer set search_path = public as $$
    select case
               when pu.anonymous then 'Anonymous'
               else coalesce(nullif(trim(d.name), ''),
                             nullif(trim(pu.guest_name), ''), 'Anonymous donor')
           end,
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
