-- ============================================================
--  0029 — ACARA remoteness (geolocation) classification
-- ============================================================
--  ACARA classifies every school by ABS remoteness: 'Major Cities',
--  'Inner Regional', 'Outer Regional', 'Remote', 'Very Remote'. We store it on
--  the reference registry (from the ACARA School Profile, joined by acara_id) and
--  stamp each school with its value at sign-up (matched by name + postcode).
--
--  After applying: run `npm run import:remoteness` to populate the registry,
--  then flip REMOTENESS_READY -> true in lib/geocode.ts, and
--  `npm run enrich:addresses` backfills existing school accounts.
-- ============================================================

alter table public.school_registry
    add column if not exists remoteness text;

alter table public.schools
    add column if not exists remoteness text;
