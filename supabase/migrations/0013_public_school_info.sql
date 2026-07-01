-- ============================================================
--  0013 — make basic school info publicly readable
-- ============================================================
--  Public campaign browsing needs the school's name, suburb and
--  verified status to be visible to anonymous visitors — but the
--  schools table was readable only by authenticated users, so those
--  fields came back null publicly (and the "Verified" badge couldn't
--  show). This opens SELECT to everyone, but restricts the anonymous
--  role to non-sensitive columns so contact_email / address / dept
--  stay private.
-- ============================================================

-- Row access: anyone may read school rows...
drop policy if exists "schools readable by authenticated" on public.schools;
create policy "school basic info readable by all"
    on public.schools for select
    using (true);

-- ...but the anonymous role may only read non-sensitive columns.
revoke select on public.schools from anon;
grant select (
    id,
    role,
    school,
    suburb,
    postcode,
    address_verified,
    created_at,
    updated_at
) on public.schools to anon;
