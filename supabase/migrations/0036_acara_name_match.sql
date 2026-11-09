-- ============================================================
--  0036 — tighten ACARA name matching + name-aware suggestions
-- ============================================================
--  Problem: check_school_address compared raw names with trigram similarity, so
--  two "<Town> Public School" names scored ~0.5 on the shared "Public School"
--  suffix alone — e.g. "Avoca Public School" matched "Berrima Public School" at
--  postcode 2577 even though no Avoca school exists there. That let a
--  non-existent/closed school pass sign-up (worse for NSW gov schools, whose ABN
--  name-match is waived).
--
--  Fix: compare the DISTINCTIVE part of the name. norm_school_name() strips the
--  generic words (School/Public/Primary/College/…) and expands common
--  abbreviations, so "Avoca" vs "Berrima" scores ~0 (mismatch) while real
--  names/typos still match. suggest_school() now ranks "did you mean" by name
--  similarity to what the user typed (a proper typo helper), within the postcode.
-- ============================================================

-- Distinctive-name normaliser: upper-case, drop punctuation, expand common
-- abbreviations, strip generic school words, collapse whitespace.
create or replace function public.norm_school_name(s text)
returns text
language plpgsql
immutable
as $$
declare t text := upper(coalesce(s, ''));
begin
    t := regexp_replace(t, '[^A-Z0-9 ]', ' ', 'g');
    t := regexp_replace(t, '\yNTH\y', 'NORTH', 'g');
    t := regexp_replace(t, '\ySTH\y', 'SOUTH', 'g');
    t := regexp_replace(t, '\yMT\y',  'MOUNT', 'g');
    t := regexp_replace(t, '\yST\y',  'SAINT', 'g');
    -- Strip generic school words that carry no distinguishing information.
    t := regexp_replace(
        t,
        '\y(THE|SCHOOL|PUBLIC|PRIMARY|SECONDARY|HIGH|CENTRAL|COLLEGE|CAMPUS|STATE|INFANTS|INFANT|PRESCHOOL|KINDERGARTEN|AREA|DISTRICT|COMMUNITY|AND|OF|FOR|PS|HS|SS|SC)\y',
        ' ', 'g');
    t := regexp_replace(t, '\s+', ' ', 'g');
    return trim(both ' ' from t);
end;
$$;

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
    name_floor constant real := 0.45; -- on the DISTINCTIVE (normalised) name
    addr_floor constant real := 0.30;
begin
    -- 1) POSTCODE PATH (authoritative). The school must be at this postcode AND
    --    its distinctive name must match.
    if nullif(p_postcode,'') is not null then
        select r.official_name, r.full_address,
               similarity(public.norm_school_name(r.official_name),
                          public.norm_school_name(p_school)) as name_sim
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
               similarity(public.norm_school_name(r.official_name),
                          public.norm_school_name(p_school)) as name_sim
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

-- "Did you mean …": rank schools by how close their distinctive name is to what
-- the user typed, within the given postcode (or by address when no postcode).
drop function if exists public.suggest_school(text, text, text, int);
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
    where (nullif(p_postcode,'') is not null and r.postcode = p_postcode)
       or (nullif(p_postcode,'') is null
           and r.full_address % trim(both ' ' from
               coalesce(p_address,'') || ' ' ||
               coalesce(p_suburb,'')  || ' ' ||
               coalesce(p_postcode,'')))
    order by score desc
    limit greatest(p_limit, 1);
$$;
