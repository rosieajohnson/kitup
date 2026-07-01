-- ============================================================
--  0004 — auto-provision profile + subtype on sign-up
-- ============================================================
--  The schema note in 0001 says sign-up must create the profiles
--  row AND the matching schools/donors row (same id), wrapped
--  together. Doing that from the client is unsafe: with email
--  confirmation on there is no session yet (so RLS `auth.uid() = id`
--  blocks the inserts), and the two writes must be atomic.
--
--  So we do it in a trigger on auth.users instead. The app passes
--  role + profile fields as user metadata to supabase.auth.signUp;
--  this reads raw_user_meta_data and provisions the rows as the
--  function owner (SECURITY DEFINER), bypassing RLS for this one
--  trusted operation.
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
    -- Unknown/absent role: leave provisioning to the app rather than
    -- guessing. The auth user still gets created.
    if v_role is null or v_role not in ('school', 'donor') then
        return new;
    end if;

    insert into public.profiles (id, role)
    values (new.id, v_role::public.user_role);

    if v_role = 'school' then
        insert into public.schools (
            id, school, address, suburb, postcode, contact_email, department
        )
        values (
            new.id,
            coalesce(nullif(new.raw_user_meta_data ->> 'school', ''),
                     'Unnamed school'),
            nullif(new.raw_user_meta_data ->> 'address', ''),
            nullif(new.raw_user_meta_data ->> 'suburb', ''),
            nullif(new.raw_user_meta_data ->> 'postcode', ''),
            new.email,
            nullif(new.raw_user_meta_data ->> 'department', '')
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

-- Fires once per new auth user. Drop-if-exists keeps the migration
-- re-runnable.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
