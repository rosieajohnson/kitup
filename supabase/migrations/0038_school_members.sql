-- ============================================================
--  0038 — multi-user access to a school (team members)
-- ============================================================
--  Lets a school owner invite colleagues to co-manage the school account with
--  roles: owner / editor / contributor.
--    - owner       : everything, incl. school profile/ABN + managing members
--    - editor      : add/edit campaigns & items AND publish/close
--    - contributor : add/edit campaigns & items, but NOT publish/close
--
--  Design is a SUPERSET: the existing owner (schools.id = auth.uid()) always
--  keeps full access, so applying this migration changes nothing until members
--  are actually invited. The app keeps the whole feature dormant behind a
--  TEAM_ACCESS_READY flag regardless.
-- ============================================================

create table if not exists public.school_members (
    school_id  uuid not null references public.schools(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null check (role in ('owner','editor','contributor')),
    created_at timestamptz not null default now(),
    primary key (school_id, user_id)
);
alter table public.school_members enable row level security;

-- Is the caller the owner of, or an accepted member of, this school?
-- SECURITY DEFINER so it can read school_members from inside RLS policies
-- without recursing on that table's own RLS. auth.uid() still returns the
-- CALLER's id inside a definer function (it reads the request JWT).
create or replace function public.is_school_member(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select p_school = auth.uid()
        or exists (
            select 1 from public.school_members m
            where m.school_id = p_school and m.user_id = auth.uid()
        );
$$;

-- The caller's role for a school: 'owner' when they are the school row itself,
-- else their membership role, else null.
create or replace function public.school_role(p_school uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select case
        when p_school = auth.uid() then 'owner'
        else (select role from public.school_members m
              where m.school_id = p_school and m.user_id = auth.uid())
    end;
$$;

-- school_members RLS: a member can read the memberships of a school they belong
-- to; only the owner can add/remove/change members.
drop policy if exists "members read own school memberships" on public.school_members;
create policy "members read own school memberships"
    on public.school_members for select to authenticated
    using (user_id = auth.uid() or public.is_school_member(school_id));

drop policy if exists "owner manages memberships" on public.school_members;
create policy "owner manages memberships"
    on public.school_members for all to authenticated
    using (school_id = auth.uid())
    with check (school_id = auth.uid());

-- ---- Superset the existing write/read policies to include members ----

drop policy if exists "school writes own campaigns" on public.campaigns;
create policy "school members write campaigns"
    on public.campaigns for all to authenticated
    using (public.is_school_member(school_id))
    with check (public.is_school_member(school_id));

drop policy if exists "school manages items in own campaigns" on public.items;
create policy "school members manage items"
    on public.items for all to authenticated
    using (exists (select 1 from public.campaigns c
                   where c.id = items.campaign_id
                     and public.is_school_member(c.school_id)))
    with check (exists (select 1 from public.campaigns c
                   where c.id = items.campaign_id
                     and public.is_school_member(c.school_id)));

drop policy if exists "donor or campaign-owner reads purchases" on public.purchases;
create policy "donor or school member reads purchases"
    on public.purchases for select to authenticated
    using (auth.uid() = donor_id
           or exists (select 1 from public.campaigns c
                      where c.id = purchases.campaign_id
                        and public.is_school_member(c.school_id)));

-- Note: schools UPDATE policy is intentionally left owner-only
-- ("school manages own row", auth.uid() = id) — editing the school profile/ABN
-- and managing members stay owner-only. Members simply can't update schools.

-- ---- Enforce publish/close by role at the DB level ----
-- Contributors can edit campaign content but must not change status
-- (publish/close). Service-role / no-JWT updates (cron, webhook, admin) are
-- allowed through — only an authenticated contributor is blocked.
create or replace function public.enforce_campaign_status_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        return new;  -- service role / no session (cron, webhook, admin)
    end if;
    if new.status is distinct from old.status then
        if public.school_role(new.school_id) not in ('owner','editor') then
            raise exception
                'Only owners and editors can publish or close a campaign';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_campaign_status_role on public.campaigns;
create trigger trg_campaign_status_role
    before update on public.campaigns
    for each row execute function public.enforce_campaign_status_role();
