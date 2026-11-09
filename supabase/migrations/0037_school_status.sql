-- ============================================================
--  0037 — store ACARA open/closed status + make matching status-aware
-- ============================================================
--  Previously the importer read the ASL "Status" column only to skip non-open
--  rows, then discarded it — so the registry couldn't denote open vs closed, and
--  a school that closed but is still listed could linger. Now we STORE status.
--  Verification matches/suggests OPEN schools only; if a typed name matches a
--  CLOSED school at that postcode, we return a distinct 'closed' result so
--  sign-up can say the school appears to have closed.
--
--  Back-compat: existing rows have status = NULL until the next ASL re-import;
--  NULL is treated as open, so nothing changes until the registry is refreshed.
-- ============================================================

alter table public.school_registry
    add column if not exists status text;   -- raw ACARA ASL status (e.g. 'Open'/'Closed'); NULL = treated as open

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
    v_open     record;
    v_closed   record;
    v_match    record;
    v_input    text;
    v_name_sim real;
    name_floor constant real := 0.45; -- on the DISTINCTIVE (normalised) name
    addr_floor constant real := 0.30;
begin
    -- 1) POSTCODE PATH (authoritative). The school must be at this postcode.
    if nullif(p_postcode,'') is not null then
        -- Best OPEN (or not-yet-statused) school by distinctive-name similarity.
        select r.official_name, r.full_address,
               similarity(public.norm_school_name(r.official_name),
                          public.norm_school_name(p_school)) as name_sim
        into v_open
        from public.school_registry r
        where r.postcode = p_postcode
          and (r.status is null or lower(r.status) = 'open')
        order by name_sim desc
        limit 1;

        if v_open.name_sim >= name_floor then
            return jsonb_build_object(
                'status','match',
                'confidence', round(v_open.name_sim::numeric, 2),
                'matched_address', v_open.full_address,
                'method','postcode');
        end if;

        -- No open name-match: does the name match a CLOSED school here?
        select r.official_name, r.full_address,
               similarity(public.norm_school_name(r.official_name),
                          public.norm_school_name(p_school)) as name_sim
        into v_closed
        from public.school_registry r
        where r.postcode = p_postcode
          and r.status is not null and lower(r.status) <> 'open'
        order by name_sim desc
        limit 1;

        if v_closed.name_sim >= name_floor then
            return jsonb_build_object(
                'status','closed',
                'suggested_name', v_closed.official_name,
                'matched_address', v_closed.full_address,
                'confidence', round(v_closed.name_sim::numeric, 2),
                'method','postcode');
        end if;

        if v_open.official_name is not null then
            return jsonb_build_object(
                'status','mismatch',
                'suggested_name', v_open.official_name,
                'matched_address', v_open.full_address,
                'confidence', round(coalesce(v_open.name_sim,0)::numeric, 2),
                'method','postcode');
        end if;

        return jsonb_build_object(
            'status','unverified',
            'reason','no school at that postcode in the registry',
            'method','postcode');
    end if;

    -- 2) SUBURB PATH (only when no postcode supplied) — open schools only.
    if nullif(p_suburb,'') is not null then
        select r.official_name, r.full_address,
               similarity(public.norm_school_name(r.official_name),
                          public.norm_school_name(p_school)) as name_sim
        into v_match
        from public.school_registry r
        where lower(r.suburb) = lower(p_suburb)
          and (r.status is null or lower(r.status) = 'open')
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
    end if;

    -- 3) ADDRESS FALLBACK (only when no postcode and no suburb match) — open only.
    v_input := trim(both ' ' from
        coalesce(p_address,'')  || ' ' ||
        coalesce(p_suburb,'')   || ' ' ||
        coalesce(p_postcode,''));

    select r.official_name, r.full_address,
           similarity(r.full_address, v_input) as addr_sim
    into v_match
    from public.school_registry r
    where r.full_address % v_input
      and (r.status is null or lower(r.status) = 'open')
    order by addr_sim desc
    limit 1;

    if not found or v_match.addr_sim < addr_floor then
        return jsonb_build_object(
            'status','unverified',
            'reason','no confident match in registry');
    end if;

    v_name_sim := similarity(public.norm_school_name(v_match.official_name),
                             public.norm_school_name(p_school));
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

-- "Did you mean …": suggest OPEN schools only, ranked by name similarity.
create or replace function public.suggest_school(
    p_school   text default null,
    p_address  text default null,
    p_suburb   text default null,
    p_postcode text default null,
    p_limit    int  default 5
)
returns table (suggested_name text, registry_address text, score real)
language sql
stable
as $$
    select r.official_name,
           r.full_address,
           case
               when nullif(p_school,'') is not null then
                   similarity(public.norm_school_name(r.official_name),
                              public.norm_school_name(p_school))
               else
                   similarity(r.full_address, trim(both ' ' from
                       coalesce(p_address,'') || ' ' ||
                       coalesce(p_suburb,'')  || ' ' ||
                       coalesce(p_postcode,'')))
           end as score
    from public.school_registry r
    where (r.status is null or lower(r.status) = 'open')
      and (
          (nullif(p_postcode,'') is not null and r.postcode = p_postcode)
          or (nullif(p_postcode,'') is null
              and r.full_address % trim(both ' ' from
                  coalesce(p_address,'') || ' ' ||
                  coalesce(p_suburb,'')  || ' ' ||
                  coalesce(p_postcode,'')))
      )
    order by score desc
    limit greatest(p_limit, 1);
$$;
