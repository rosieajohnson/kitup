-- ============================================================
--  0035 — capture donor first/last name separately
-- ============================================================
--  Donors (and guests) now give first + last name separately at sign-up and
--  checkout, so the ASF bulk-upload CSV has accurate name columns. We keep the
--  combined `name` / `guest_name` for the rest of the app (public supporters
--  list, email greetings). Rebuilds the 0033 handle_new_user trigger verbatim
--  plus the donor first/last columns.
-- ============================================================

alter table public.donors
    add column if not exists first_name text,
    add column if not exists last_name  text;

alter table public.purchases
    add column if not exists guest_first_name text,
    add column if not exists guest_last_name  text;

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
        insert into public.donors (id, name, first_name, last_name, address, contact_email)
        values (
            new.id,
            coalesce(
                nullif(new.raw_user_meta_data ->> 'name', ''),
                nullif(trim(concat_ws(' ',
                    new.raw_user_meta_data ->> 'first_name',
                    new.raw_user_meta_data ->> 'last_name')), ''),
                'Anonymous donor'),
            nullif(new.raw_user_meta_data ->> 'first_name', ''),
            nullif(new.raw_user_meta_data ->> 'last_name', ''),
            nullif(new.raw_user_meta_data ->> 'address', ''),
            new.email
        );
    end if;

    return new;
end;
$$;
