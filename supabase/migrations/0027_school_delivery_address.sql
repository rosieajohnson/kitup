-- ============================================================
--  0027 — school delivery address confirmation
-- ============================================================
--  schools.address already holds the delivery street line. It's auto-filled by
--  reverse-geocoding the school's ACARA coordinates (scripts/enrich_school_addresses.mjs
--  and the sign-up hook), then the school can confirm/correct it in their
--  profile. This flag records whether the school has confirmed it — the funding
--  invoice shows "confirmed by school" vs "auto-detected" so ASF knows whether
--  the shipping address is trusted.
--
--  After applying, flip DELIVERY_CONFIRM_READY -> true in lib/profile.ts.
-- ============================================================

alter table public.schools
    add column if not exists delivery_confirmed boolean not null default false;
