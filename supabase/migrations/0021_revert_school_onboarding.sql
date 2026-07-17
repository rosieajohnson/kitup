-- ============================================================
--  0021 — revert 0020 (ASF-style school onboarding)
-- ============================================================
--  Restores the sign-up trigger to its pre-0020 form (kept the ABN
--  column from 0019) and drops the onboarding columns 0020 added.
--  Restore the trigger FIRST so it no longer references the columns,
--  then drop them.
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
            id, school, address, suburb, postcode, contact_email, department, abn
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
            nullif(new.raw_user_meta_data ->> 'abn', '')
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

alter table public.schools
    drop column if exists contact_mobile,
    drop column if exists contact_dob,
    drop column if exists contact_position,
    drop column if exists authorised,
    drop column if exists agreed_terms,
    drop column if exists approval_status,
    drop column if exists identity_verified,
    drop column if exists identity_session_id;
