-- ============================================================
--  0032 — school authorisation, contact position, sign-up attestations
-- ============================================================
--  At sign-up a school now provides the contact's POSITION (e.g. Principal,
--  Treasurer) and confirms they are AUTHORISED to act for the school, are
--  18+, and have read the ASF Grant Agreement. Re-adds contact_position +
--  authorised (dropped in 0021) and records the attestation timestamps so
--  the schools row is a complete record of what the authorised contact
--  agreed to. Restore the trigger to read these from sign-up metadata.
-- ============================================================

alter table public.schools
    add column if not exists contact_position  text,
    add column if not exists authorised        boolean not null default false,
    add column if not exists authorised_at     timestamptz,
    add column if not exists grant_accepted_at timestamptz,
    add column if not exists age_confirmed_at  timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text := new.raw_user_meta_data ->> 'role';
begin
    if v_role is null or v_role not in ('school', 'donor') then
        return new;
    end if;

    insert into public.profiles (id, role)
    values (new.id, v_role::public.user_role);

    if v_role = 'school' then
        insert into public.schools (
            id, school, address, suburb, postcode, contact_email, department, abn,
            contact_position, authorised, authorised_at, grant_accepted_at,
            age_confirmed_at
        )
        values (
            new.id,
            coalesce(nullif(new.raw_user_meta_data ->> 'school', ''),
                     'Unnamed school'),
            nullif(new.raw_user_meta_data ->> 'address', ''),
            nullif(new.raw_user_meta_data ->> 'suburb', ''),
            nullif(new.raw_user_meta_data ->> 'postcode', ''),
            new.email,
            nullif(new.raw_user_meta_data ->> 'department', ''),
            nullif(new.raw_user_meta_data ->> 'abn', ''),
            nullif(new.raw_user_meta_data ->> 'position', ''),
            coalesce(new.raw_user_meta_data ->> 'authorised', '') = 'true',
            (nullif(new.raw_user_meta_data ->> 'authorised_at', ''))::timestamptz,
            (nullif(new.raw_user_meta_data ->> 'grant_accepted_at', ''))::timestamptz,
            (nullif(new.raw_user_meta_data ->> 'age_confirmed_at', ''))::timestamptz
        );
    else
        insert into public.donors (id, name, address, contact_email)
        values (
            new.id,
            coalesce(nullif(new.raw_user_meta_data ->> 'name', ''),
                     'Anonymous donor'),
            nullif(new.raw_user_meta_data ->> 'address', ''),
            new.email
        );
    end if;

    return new;
end;
$$;
