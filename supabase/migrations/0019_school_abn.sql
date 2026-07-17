-- ============================================================
--  0019 — school ABN capture + verification status
-- ============================================================
--  Schools now provide an ABN at sign-up. We store it plus a
--  verification flag (matched against the ABR entity name,
--  computed server-side) and the ABR entity name we matched.
--  abn_verified mirrors the existing address_verified badge.
-- ============================================================

alter table public.schools
    add column if not exists abn              text,
    add column if not exists abn_verified     boolean not null default false,
    add column if not exists abn_entity_name  text;

-- ABNs are public information; expose the number + verified badge to
-- anonymous visitors (entity name stays internal for admin review).
grant select (abn, abn_verified) on public.schools to anon;

-- Extend the provisioning trigger to store the ABN from sign-up metadata.
-- abn_verified stays false here — verification is computed server-side against
-- the ABR (never trusted from client-supplied metadata).
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
