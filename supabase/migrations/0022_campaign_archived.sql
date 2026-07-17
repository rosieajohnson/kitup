-- ============================================================
--  0022 — 'archived' campaign status (admin take-down)
-- ============================================================
--  Admins can remove a campaign from the public site by archiving
--  it. Public browsing already shows only status = 'live', so an
--  archived campaign disappears from the site but its record (and
--  donation history / reports) is kept and can be restored.
-- ============================================================

alter type public.campaign_status add value if not exists 'archived';
