-- ============================================================
--  0033 — persist the school's contact phone from sign-up
-- ============================================================
--  schools.contact_phone already exists (0023, added for profile editing).
--  Schools now also provide it AT sign-up, so extend handle_new_user() to
--  store it from the sign-up metadata ('phone'). Rebuilds the 0032 trigger
--  verbatim plus the contact_phone column.
-- ============================================================

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
            contact_position, contact_phone, authorised, authorised_at,
            grant_accepted_at, age_confirmed_at
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
            nullif(new.raw_user_meta_data ->> 'phone', ''),
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
