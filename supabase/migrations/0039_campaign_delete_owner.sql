-- ============================================================
--  0039 — only the school owner may delete a campaign
-- ============================================================
--  Members can create/edit campaigns (and editors publish/close), but DELETE is
--  owner-only. The campaigns write RLS is "for all" to any member, so enforce
--  delete at the DB with a trigger. Service-role / no-JWT deletes (admin,
--  cascades from auth user deletion) pass through — only an authenticated
--  non-owner is blocked.
-- ============================================================

create or replace function public.enforce_campaign_delete_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        return old;  -- service role / no session (admin, cascade)
    end if;
    if public.school_role(old.school_id) <> 'owner' then
        raise exception 'Only the school owner can delete a campaign';
    end if;
    return old;
end;
$$;

drop trigger if exists trg_campaign_delete_owner on public.campaigns;
create trigger trg_campaign_delete_owner
    before delete on public.campaigns
    for each row execute function public.enforce_campaign_delete_owner();
