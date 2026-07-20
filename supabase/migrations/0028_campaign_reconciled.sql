-- ============================================================
--  0028 — campaign reconciliation marker
-- ============================================================
--  When a campaign closes (the earlier of fully funded, or its deadline
--  passing), the admin gets a reconciliation email (funded items with dates +
--  invoice numbers + a dispatch column). reconciled_at records that it's been
--  sent, so the two triggers (fully-funded path and the daily deadline cron)
--  send it exactly once — the sender atomically claims the row by setting this
--  where it's still null.
--
--  After applying, flip RECONCILE_READY -> true in lib/reconcile.ts.
-- ============================================================

alter table public.campaigns
    add column if not exists reconciled_at timestamptz;
