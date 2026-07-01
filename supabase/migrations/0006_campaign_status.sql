-- ============================================================
--  0006 — campaign draft / live status
-- ============================================================
--  Campaigns are now created as a private DRAFT and only become
--  visible to the public + donors when the school publishes them
--  ("go live"). The owning school can always see its own drafts.
-- ============================================================

create type public.campaign_status as enum ('draft', 'live');

alter table public.campaigns
    add column status public.campaign_status not null default 'draft';

create index campaigns_status_idx on public.campaigns (status);

-- Existing campaigns were already public, so keep them live. New rows
-- default to 'draft' (above) and must be published explicitly.
update public.campaigns set status = 'live';

-- ------------------------------------------------------------
--  RLS: the public sees only LIVE campaigns; the owning school
--  still sees its own (any status) via the existing
--  "school writes own campaigns" ALL policy.
-- ------------------------------------------------------------
drop policy if exists "campaigns publicly readable" on public.campaigns;
create policy "live campaigns publicly readable"
    on public.campaigns for select
    using (status = 'live');

-- Items follow their campaign: public read only for items whose
-- campaign is live. The owning school keeps full access via the
-- existing "school manages items in own campaigns" ALL policy.
drop policy if exists "items publicly readable" on public.items;
create policy "items of live campaigns publicly readable"
    on public.items for select
    using (
        exists (
            select 1 from public.campaigns c
            where c.id = items.campaign_id and c.status = 'live'
        )
    );
