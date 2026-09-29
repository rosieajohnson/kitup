-- ============================================================
--  0031 — ACARA equity/demographic markers on the registry
-- ============================================================
--  From the ACARA School Profile (joined by acara_id). Used to give ASF the
--  equity context in the school-profile/impact email. Stored on the reference
--  registry only (the email looks them up per school); schools aren't stamped.
--
--  After applying: run `npm run import:demographics`, then flip
--  DEMOGRAPHICS_READY -> true in lib/geocode.ts.
-- ============================================================

alter table public.school_registry
    add column if not exists total_enrolments   integer,
    add column if not exists icsea              integer,
    add column if not exists icsea_percentile   integer,
    add column if not exists sea_bottom_quarter numeric(5,1),  -- % most disadvantaged (low-SES)
    add column if not exists indigenous_pct     numeric(5,1),  -- First Nations enrolments %
    add column if not exists lbote_pct          numeric(5,1);  -- language background other than English %
