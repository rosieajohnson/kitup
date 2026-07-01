-- ============================================================
--  Crowdfunding Platform — Master Schema
--  Target: PostgreSQL (Supabase)
-- ============================================================
--  Run top-to-bottom on a fresh database (Supabase SQL Editor or
--  a migration). Single source of truth — no separate add-ons.
--
--  Actors (both authenticated via auth.users):
--    SCHOOLS  create and edit campaigns + the items they need.
--    DONORS   browse campaigns and purchase/fund items.
--
--  Modeling: a thin profiles table (id + role) is the "Users"
--  umbrella; schools and donors are role-specific subtype tables.
--  The (id, role) composite FK guarantees a user is EITHER a
--  school OR a donor — never both.
--
--  Conventions: snake_case, UUID PKs, timestamptz, money as
--  numeric(12,2). External facts (Hart Sport catalog, school
--  addresses) are validated against LOCAL reference tables, since
--  the database can't query an outside website or API by itself.
-- ============================================================

create extension if not exists pgcrypto;     -- gen_random_uuid()
create extension if not exists moddatetime;   -- auto updated_at
create extension if not exists pg_trgm;        -- fuzzy text matching


-- ------------------------------------------------------------
--  Role discriminator
-- ------------------------------------------------------------
create type public.user_role as enum ('school', 'donor');


-- ============================================================
--  PROFILES  (the "Users" umbrella, 1:1 with auth.users)
-- ============================================================
create table public.profiles (
    id         uuid             primary key
               references auth.users (id) on delete cascade,
    role       public.user_role not null,
    created_at timestamptz      not null default now(),
    updated_at timestamptz      not null default now(),
    unique (id, role)            -- target for subtype composite FKs
);

create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute procedure moddatetime (updated_at);


-- ============================================================
--  SCHOOL REFERENCE DATA + ADDRESS VERIFICATION
--  Defined before the schools table because the schools insert
--  trigger calls check_school_address(), which reads this data.
-- ============================================================

-- Authoritative schools list (source of truth for name <-> address).
-- Populate from the ACARA Australian Schools List (asl.acara.edu.au)
-- or a state master dataset on data.gov.au / data.nsw.gov.au, which
-- carry name, address, suburb, postcode, state and lat/long.
create table public.school_registry (
    id             uuid primary key default gen_random_uuid(),
    acara_id       text unique,
    official_name  text not null,
    street_address text,
    suburb         text,
    state          text,
    postcode       text,
    latitude       double precision,
    longitude      double precision,
    source         text,                       -- e.g. 'ACARA ASL 2026'
    full_address   text generated always as (
        trim(both ' ' from
            coalesce(street_address,'') || ' ' ||
            coalesce(suburb,'')         || ' ' ||
            coalesce(state,'')          || ' ' ||
            coalesce(postcode,'')
        )
    ) stored
);

create index school_registry_address_trgm
    on public.school_registry using gin (full_address gin_trgm_ops);
create index school_registry_name_trgm
    on public.school_registry using gin (official_name gin_trgm_ops);
create index school_registry_postcode_idx
    on public.school_registry (postcode);
create index school_registry_suburb_lower_idx
    on public.school_registry (lower(suburb));


-- suggest_school: best matches for a "pick your school" dropdown.
create or replace function public.suggest_school(
    p_address  text default null,
    p_suburb   text default null,
    p_postcode text default null,
    p_limit    int  default 5
)
returns table (suggested_name text, registry_address text, score real)
language sql
stable
as $$
    with input as (
        select trim(both ' ' from
            coalesce(p_address,'')  || ' ' ||
            coalesce(p_suburb,'')   || ' ' ||
            coalesce(p_postcode,'')) as q
    )
    select r.official_name,
           r.full_address,
           similarity(r.full_address, (select q from input)) as score
    from public.school_registry r
    where (nullif(p_postcode,'') is not null and r.postcode = p_postcode)
       or (nullif(p_postcode,'') is null
           and r.full_address % (select q from input))
    order by score desc
    limit greatest(p_limit, 1);
$$;


-- check_school_address: verify a name against an address.
--   status = 'match' | 'mismatch' | 'unverified'
--   method = 'locality' (postcode/suburb path) | 'address' (fallback)
create or replace function public.check_school_address(
    p_school   text,
    p_address  text,
    p_suburb   text default null,
    p_postcode text default null
)
returns jsonb
language plpgsql
stable
as $$
declare
    v_match    record;
    v_input    text;
    v_name_sim real;
    name_floor constant real := 0.45;   -- min name similarity for a match
    addr_floor constant real := 0.30;   -- min address similarity to trust a row
begin
    -- 1) LOCALITY PATH: narrow to schools in this postcode/suburb,
    --    then find the closest name. Strongest signal available.
    if nullif(p_postcode,'') is not null or nullif(p_suburb,'') is not null then
        select r.official_name,
               r.full_address,
               similarity(r.official_name, p_school) as name_sim
        into v_match
        from public.school_registry r
        where (nullif(p_postcode,'') is not null and r.postcode = p_postcode)
           or (nullif(p_suburb,'')   is not null and lower(r.suburb) = lower(p_suburb))
        order by name_sim desc
        limit 1;

        if found then
            if v_match.name_sim >= name_floor then
                return jsonb_build_object(
                    'status','match',
                    'confidence', round(v_match.name_sim::numeric, 2),
                    'matched_address', v_match.full_address,
                    'method','locality');
            else
                return jsonb_build_object(
                    'status','mismatch',
                    'suggested_name', v_match.official_name,
                    'matched_address', v_match.full_address,
                    'confidence', round(v_match.name_sim::numeric, 2),
                    'method','locality');
            end if;
        end if;
        -- nothing in that locality -> fall through to address matching
    end if;

    -- 2) ADDRESS FALLBACK: fuzzy-match the combined address string.
    v_input := trim(both ' ' from
        coalesce(p_address,'')  || ' ' ||
        coalesce(p_suburb,'')   || ' ' ||
        coalesce(p_postcode,''));

    select r.official_name,
           r.full_address,
           similarity(r.full_address, v_input) as addr_sim
    into v_match
    from public.school_registry r
    where r.full_address % v_input
    order by addr_sim desc
    limit 1;

    if not found or v_match.addr_sim < addr_floor then
        return jsonb_build_object(
            'status','unverified',
            'reason','no confident match in registry');
    end if;

    v_name_sim := similarity(v_match.official_name, p_school);

    if v_name_sim >= name_floor then
        return jsonb_build_object(
            'status','match',
            'confidence', round(v_name_sim::numeric, 2),
            'matched_address', v_match.full_address,
            'method','address');
    else
        return jsonb_build_object(
            'status','mismatch',
            'suggested_name', v_match.official_name,
            'matched_address', v_match.full_address,
            'confidence', round(v_name_sim::numeric, 2),
            'method','address');
    end if;
end;
$$;


-- Trigger function that auto-populates schools.address_verified.
-- BEFORE INSERT/UPDATE so it just sets NEW (no extra write, no
-- recursion). Records the verdict; never raises -> never blocks.
create or replace function public.schools_verify_address()
returns trigger
language plpgsql
as $$
begin
    new.address_verified := (
        public.check_school_address(
            new.school, new.address, new.suburb, new.postcode
        ) ->> 'status'
    ) = 'match';
    return new;
end;
$$;


-- ============================================================
--  SCHOOLS  (id, school, address, suburb, postcode, contact_email,
--            department, address_verified)
--  Attaches to a profile whose role = 'school'.
-- ============================================================
create table public.schools (
    id               uuid             primary key,
    role             public.user_role not null default 'school'
                     check (role = 'school'),
    school           text             not null,
    address          text,                          -- street line
    suburb           text,
    postcode         text,
    contact_email    text             not null unique
                     check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    department       text,
    address_verified boolean          not null default false,
    created_at       timestamptz      not null default now(),
    updated_at       timestamptz      not null default now(),

    -- AU postcodes are 4 digits; null allowed for not-yet-filled rows.
    constraint schools_postcode_format
        check (postcode is null or postcode ~ '^[0-9]{4}$'),

    foreign key (id, role)
        references public.profiles (id, role) on delete cascade
);

create trigger schools_set_updated_at
    before update on public.schools
    for each row execute procedure moddatetime (updated_at);

create trigger schools_set_address_verified
    before insert or update of school, address, suburb, postcode
    on public.schools
    for each row execute procedure public.schools_verify_address();


-- ============================================================
--  DONORS  (id, name, address, contact_email)
--  Attaches to a profile whose role = 'donor'.
-- ============================================================
create table public.donors (
    id            uuid             primary key,
    role          public.user_role not null default 'donor'
                  check (role = 'donor'),
    name          text             not null,
    address       text,
    contact_email text             not null unique
                  check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    created_at    timestamptz      not null default now(),
    updated_at    timestamptz      not null default now(),

    foreign key (id, role)
        references public.profiles (id, role) on delete cascade
);

create trigger donors_set_updated_at
    before update on public.donors
    for each row execute procedure moddatetime (updated_at);


-- ============================================================
--  CAMPAIGNS  (created and edited by schools only)
--  school_id -> schools means a donor cannot own a campaign.
-- ============================================================
create table public.campaigns (
    id           uuid          primary key default gen_random_uuid(),
    title        text          not null check (length(trim(title)) > 0),
    description  text,
    funding_goal numeric(12,2) not null check (funding_goal > 0),
    deadline     timestamptz   not null,
    school_id    uuid          not null
                 references public.schools (id) on delete cascade,
    created_at   timestamptz   not null default now(),
    updated_at   timestamptz   not null default now(),

    constraint deadline_after_creation check (deadline > created_at)
);

create index campaigns_school_id_idx on public.campaigns (school_id);

create trigger campaigns_set_updated_at
    before update on public.campaigns
    for each row execute procedure moddatetime (updated_at);


-- ============================================================
--  HART SPORT PRODUCT CATALOG  (reference table)
--  A constraint can't query hartsport.com.au directly, so we keep
--  a local catalog synced from it and force every item to point at
--  a row here. Sync via an Edge Function / pg_cron job.
-- ============================================================
create table public.hart_sport_products (
    id          uuid          primary key default gen_random_uuid(),
    hart_sku    text          not null unique,
    name        text          not null,
    unit_price  numeric(12,2)          check (unit_price >= 0),
    product_url text,
    synced_at   timestamptz   not null default now()
);


-- ============================================================
--  ITEMS  (what a campaign needs; each maps to a Hart product)
-- ============================================================
create table public.items (
    id              uuid          primary key default gen_random_uuid(),
    campaign_id     uuid          not null
                    references public.campaigns (id) on delete cascade,
    hart_product_id uuid          not null
                    references public.hart_sport_products (id) on delete restrict,
    title           text          not null,
    description     text,
    cost            numeric(12,2) not null check (cost >= 0),
    quantity_needed integer       not null check (quantity_needed > 0),
    created_at      timestamptz   not null default now(),

    unique (id, campaign_id)        -- target for purchases composite FK
);

create index items_campaign_id_idx     on public.items (campaign_id);
create index items_hart_product_id_idx on public.items (hart_product_id);


-- ============================================================
--  PURCHASES  (one row per item a donor funds)
--  donor_id -> donors means a school cannot record a purchase.
--  (item_id, campaign_id) -> items keeps item + campaign in sync.
-- ============================================================
create table public.purchases (
    id          uuid          primary key default gen_random_uuid(),
    donor_id    uuid          not null
                references public.donors (id) on delete cascade,
    item_id     uuid          not null,
    campaign_id uuid          not null,
    quantity    integer       not null default 1 check (quantity > 0),
    amount      numeric(12,2) not null check (amount > 0),
    created_at  timestamptz   not null default now(),

    foreign key (item_id, campaign_id)
        references public.items (id, campaign_id) on delete cascade
);

create index purchases_donor_id_idx    on public.purchases (donor_id);
create index purchases_item_id_idx     on public.purchases (item_id);
create index purchases_campaign_id_idx on public.purchases (campaign_id);


-- ============================================================
--  ROW LEVEL SECURITY
--    schools  -> create/edit their own campaigns & items
--    donors   -> read campaigns/items, insert their own purchases
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.school_registry     enable row level security;
alter table public.schools             enable row level security;
alter table public.donors              enable row level security;
alter table public.campaigns           enable row level security;
alter table public.hart_sport_products enable row level security;
alter table public.items               enable row level security;
alter table public.purchases           enable row level security;

-- PROFILES
create policy "profiles readable by authenticated"
    on public.profiles for select to authenticated using (true);
create policy "users create own profile"
    on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile"
    on public.profiles for update to authenticated using (auth.uid() = id);

-- SCHOOL REGISTRY: read-only to app users (loaded via service_role).
create policy "registry readable by authenticated"
    on public.school_registry for select to authenticated using (true);

-- SCHOOLS
create policy "schools readable by authenticated"
    on public.schools for select to authenticated using (true);
create policy "school manages own row"
    on public.schools for all to authenticated
    using (auth.uid() = id) with check (auth.uid() = id);

-- DONORS: personal info private to the donor.
create policy "donor reads own row"
    on public.donors for select to authenticated using (auth.uid() = id);
create policy "donor manages own row"
    on public.donors for all to authenticated
    using (auth.uid() = id) with check (auth.uid() = id);

-- CAMPAIGNS: public read; only the owning school writes.
create policy "campaigns publicly readable"
    on public.campaigns for select using (true);
create policy "school writes own campaigns"
    on public.campaigns for all to authenticated
    using (auth.uid() = school_id) with check (auth.uid() = school_id);

-- CATALOG: read-only to app users (writes via service_role).
create policy "catalog readable by authenticated"
    on public.hart_sport_products for select to authenticated using (true);

-- ITEMS: public read; only the owning school writes (donors get no
-- write policy, so they can browse but not edit items).
create policy "items publicly readable"
    on public.items for select using (true);
create policy "school manages items in own campaigns"
    on public.items for all to authenticated
    using (exists (select 1 from public.campaigns c
                   where c.id = items.campaign_id and c.school_id = auth.uid()))
    with check (exists (select 1 from public.campaigns c
                   where c.id = items.campaign_id and c.school_id = auth.uid()));

-- PURCHASES: donor records their own; donor sees own, school sees
-- purchases against its campaigns. No update/delete = immutable.
create policy "donor inserts own purchase"
    on public.purchases for insert to authenticated
    with check (auth.uid() = donor_id);
create policy "donor or campaign-owner reads purchases"
    on public.purchases for select to authenticated
    using (auth.uid() = donor_id
           or exists (select 1 from public.campaigns c
                      where c.id = purchases.campaign_id and c.school_id = auth.uid()));


-- ============================================================
--  NOTES
-- ============================================================
--  * Sign-up: create the auth user, then a profiles row with the
--    chosen role, then the matching schools OR donors row (same id).
--    Wrap them together so a profile always has its subtype.
--
--  * address_verified is set automatically by trigger and is
--    advisory — badge verified schools or queue the rest for review,
--    don't block sign-up on it. The trigger reads school_registry as
--    the signing-up user (allowed by RLS); if you later lock that
--    table down, mark check_school_address SECURITY DEFINER.
--
--  * Tune name_floor / addr_floor in check_school_address against
--    your real registry data. Passing suburb + postcode greatly
--    improves accuracy. Add a `state` column + filter the same way
--    if you need it.
--
--  * "amount" = money for that line; "quantity" = units funded. Drop
--    quantity if you only track money, or compute amount in a trigger.
--
--  * Deletes use CASCADE for simplicity. For a hard money trail,
--    switch the purchases FKs to ON DELETE RESTRICT and add a
--    deleted_at soft-delete column so funded records are never lost.
-- ============================================================
