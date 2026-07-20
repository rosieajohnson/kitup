import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileCampaign, RECONCILE_READY } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

/**
 * Daily job (Vercel Cron, see vercel.json): close campaigns whose deadline has
 * passed and that haven't been reconciled yet, sending each an admin
 * reconciliation ledger. Fully-funded campaigns are reconciled earlier via the
 * payment path — whichever comes first wins (reconcileCampaign is idempotent).
 *
 * Protected by CRON_SECRET: Vercel adds `Authorization: Bearer <CRON_SECRET>`
 * to scheduled requests when that env var is set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!RECONCILE_READY) {
    return NextResponse.json({ skipped: "reconciliation not enabled yet" });
  }

  const admin = createAdminClient();
  const { data: due, error } = await admin
    .from("campaigns")
    .select("id")
    .eq("status", "live")
    .lt("deadline", new Date().toISOString())
    .is("reconciled_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let reconciled = 0;
  for (const c of due ?? []) {
    if (await reconcileCampaign(admin, c.id, "deadline reached")) reconciled++;
  }
  return NextResponse.json({ checked: due?.length ?? 0, reconciled });
}
