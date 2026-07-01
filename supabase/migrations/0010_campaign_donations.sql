-- ============================================================
--  0010 — let a school see who donated to its campaign
-- ============================================================
--  A school can read its campaign's purchases (RLS), but NOT the
--  donors table (donor rows are private). So this function exposes
--  ONLY the donor's display name (never email/address) plus the item
--  and amount, and ONLY to the campaign's owning school.
--
--  SECURITY DEFINER bypasses RLS to read donors.name, but the WHERE
--  clause restricts results to campaigns owned by the caller, so a
--  school can only ever see donations to its own campaigns.
-- ============================================================

create or replace function public.campaign_donations(p_campaign_id uuid)
returns table (
    donor_name text,
    item_title text,
    quantity   int,
    amount     numeric(12,2),
    created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    select coalesce(nullif(trim(d.name), ''), 'Anonymous donor') as donor_name,
           coalesce(i.title, 'an item')                          as item_title,
           pu.quantity,
           pu.amount,
           pu.created_at
    from public.purchases pu
    join public.campaigns c on c.id = pu.campaign_id
    left join public.donors d on d.id = pu.donor_id
    left join public.items  i on i.id = pu.item_id
    where pu.campaign_id = p_campaign_id
      and c.school_id = auth.uid()      -- only the owning school
    order by pu.created_at desc;
$$;

grant execute on function public.campaign_donations(uuid) to authenticated;
