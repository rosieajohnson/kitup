-- ============================================================
--  0030 — campaign "need & impact" fields
-- ============================================================
--  Schools describe the need/intended use when creating a campaign; this feeds
--  the ASF school-profile/impact email. All optional.
--
--  After applying, flip CAMPAIGN_IMPACT_READY -> true in lib/campaign-fields.ts.
-- ============================================================

alter table public.campaigns
    add column if not exists students_reached   integer,
    add column if not exists barrier            text,
    add column if not exists students_missing_out text,
    add column if not exists usage_context      text,
    add column if not exists usage_frequency    text,
    add column if not exists participation_goal text;
