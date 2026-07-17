-- ============================================================
--  0023 — profile editing: phone + email-verified edit unlock
-- ============================================================
--  Re-adds a phone field (dropped with the 0020 rollback) and an
--  edit-unlock timestamp. Editing a profile requires proving email
--  control first: the user clicks an emailed link that sets
--  edit_unlocked_until, opening a short window to save changes.
-- ============================================================

alter table public.schools  add column if not exists contact_phone text;
alter table public.donors   add column if not exists contact_phone text;
alter table public.profiles add column if not exists edit_unlocked_until timestamptz;
