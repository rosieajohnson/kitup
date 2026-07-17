-- ============================================================
--  0024 — make postcode authoritative in the ACARA check
-- ============================================================
--  Previously postcode was OR'd with suburb, so a wrong postcode
--  still verified if the suburb matched. Now, when a postcode is
--  supplied, the school MUST exist at that exact postcode in the
--  ACARA registry (name still has to match too). Suburb is only a
--  fallback when no postcode is given; the loose address fallback
--  is only reached when neither postcode nor a suburb match is found.
--  address_verified (trigger) and the profile-edit block both use
--  this function, so both tighten automatically.
-- ============================================================

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
    name_floor constant real := 0.45;
    addr_floor constant real := 0.30;
begin
    -- 1) POSTCODE PATH (authoritative). The school must be at this postcode.
    if nullif(p_postcode,'') is not null then
        select r.official_name, r.full_address,
               similarity(r.official_name, p_school) as name_sim
        into v_match
        from public.school_registry r
        where r.postcode = p_postcode
        order by name_sim desc
        limit 1;

        if not found then
            return jsonb_build_object(
                'status','unverified',
                'reason','no school at that postcode in the registry',
                'method','postcode');
        end if;
        if v_match.name_sim >= name_floor then
            return jsonb_build_object(
                'status','match',
                'confidence', round(v_match.name_sim::numeric, 2),
                'matched_address', v_match.full_address,
                'method','postcode');
        end if;
        return jsonb_build_object(
            'status','mismatch',
            'suggested_name', v_match.official_name,
            'matched_address', v_match.full_address,
            'confidence', round(v_match.name_sim::numeric, 2),
            'method','postcode');
    end if;

    -- 2) SUBURB PATH (only when no postcode supplied).
    if nullif(p_suburb,'') is not null then
        select r.official_name, r.full_address,
               similarity(r.official_name, p_school) as name_sim
        into v_match
        from public.school_registry r
        where lower(r.suburb) = lower(p_suburb)
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

    -- 3) ADDRESS FALLBACK (only when no postcode and no suburb match).
    v_input := trim(both ' ' from
        coalesce(p_address,'')  || ' ' ||
        coalesce(p_suburb,'')   || ' ' ||
        coalesce(p_postcode,''));

    select r.official_name, r.full_address,
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
