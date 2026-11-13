-- ============================================================
--  0042 — lock down admin/report RPC execute privileges
-- ============================================================
--  Defense-in-depth: by default Postgres grants EXECUTE on functions to PUBLIC
--  (which includes the anon role). These admin/report functions already guard
--  themselves internally (is_admin() / owner WHERE clauses) so they leak
--  nothing, but anon has no business calling them at all. Revoke the PUBLIC
--  grant and keep execute for authenticated only.
--
--  is_admin() is used inside SECURITY DEFINER functions and authenticated-only
--  RLS policies (never by anon-facing policies), so keeping the authenticated
--  grant preserves all RLS behaviour.
-- ============================================================

revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated;

revoke execute on function public.campaign_donations(uuid) from public;
grant  execute on function public.campaign_donations(uuid) to authenticated;

revoke execute on function public.campaign_report(uuid) from public;
grant  execute on function public.campaign_report(uuid) to authenticated;

revoke execute on function public.all_donations_report() from public;
grant  execute on function public.all_donations_report() to authenticated;

revoke execute on function public.admin_campaign_list() from public;
grant  execute on function public.admin_campaign_list() to authenticated;
