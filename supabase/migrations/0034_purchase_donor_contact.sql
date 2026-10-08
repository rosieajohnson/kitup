-- ============================================================
--  0034 — optional donor business + postcode on purchases
-- ============================================================
--  Donors can optionally give a business/organisation name and a postcode at
--  checkout (for the admin donor CSV export). Stored per purchase from the
--  Stripe session metadata; both nullable/optional.
-- ============================================================

alter table public.purchases
    add column if not exists business text,
    add column if not exists postcode text;
