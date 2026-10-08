import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { PURCHASE_CONTACT_READY } from "@/lib/payments";

/**
 * Admin-only CSV export of donations, one row per (donation, campaign):
 *   date | first name | last name | business | email | postcode | amount |
 *   campaign | campaign id | anonymous (y/n)
 *
 * Gated on the signed-in user being a platform admin (ASF). Reads with the
 * service-role client so it sees every donation regardless of RLS. Refunded
 * purchases are excluded. Real donor name/email are included even for
 * public-anonymous donations (the "anonymous" column records public anonymity);
 * ASF needs the identity for receipts.
 *
 * "business" and "postcode" are optional fields a donor may give at checkout
 * (migration 0034 + PURCHASE_CONTACT_READY); blank when not provided or before
 * the flag is flipped.
 */
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Row = {
  id: string;
  created_at: string;
  amount: number | string;
  campaign_id: string;
  anonymous: boolean;
  guest_name: string | null;
  guest_email: string | null;
  stripe_checkout_session_id: string | null;
  business?: string | null;
  postcode?: string | null;
  donor: { name: string | null; contact_email: string | null } | { name: string | null; contact_email: string | null }[] | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const viewer = await getViewer();
  if (!viewer.userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  // purchases.campaign_id is part of a composite FK to items(id, campaign_id),
  // so PostgREST can't embed campaigns directly — fetch titles separately.
  const { data, error } = await admin
    .from("purchases")
    .select(
      "id, created_at, amount, campaign_id, anonymous, guest_name, guest_email, stripe_checkout_session_id, donor:donors(name, contact_email)" +
        (PURCHASE_CONTACT_READY ? ", business, postcode" : ""),
    )
    .is("refunded_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rowsRaw = (data ?? []) as unknown as Row[];
  const campaignIds = Array.from(new Set(rowsRaw.map((p) => p.campaign_id)));
  const { data: camps } = campaignIds.length
    ? await admin.from("campaigns").select("id, title").in("id", campaignIds)
    : { data: [] as { id: string; title: string | null }[] };
  const titleById = new Map(
    (camps ?? []).map((c) => [c.id as string, (c.title as string) ?? ""]),
  );

  // Aggregate per (checkout session, campaign) so one donation that funds
  // several items in a campaign is a single row.
  type Agg = {
    date: string;
    name: string;
    email: string;
    business: string;
    postcode: string;
    anonymous: boolean;
    amount: number;
    campaignTitle: string;
    campaignId: string;
  };
  const byKey = new Map<string, Agg>();
  for (const p of rowsRaw) {
    const donor = Array.isArray(p.donor) ? p.donor[0] : p.donor;
    const name = (donor?.name ?? p.guest_name ?? "").trim();
    const email = (donor?.contact_email ?? p.guest_email ?? "").trim();
    const sessionKey = p.stripe_checkout_session_id || `p:${p.id}`;
    const key = `${sessionKey}::${p.campaign_id}`;
    const amount = Number(p.amount) || 0;
    const existing = byKey.get(key);
    if (existing) {
      existing.amount += amount;
      if (p.created_at < existing.date) existing.date = p.created_at;
      existing.business ||= (p.business ?? "").trim();
      existing.postcode ||= (p.postcode ?? "").trim();
    } else {
      byKey.set(key, {
        date: p.created_at,
        name,
        email,
        business: (p.business ?? "").trim(),
        postcode: (p.postcode ?? "").trim(),
        anonymous: Boolean(p.anonymous),
        amount,
        campaignTitle: titleById.get(p.campaign_id) ?? "",
        campaignId: p.campaign_id,
      });
    }
  }

  const rows = Array.from(byKey.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const header = [
    "date",
    "first name",
    "last name",
    "business",
    "email",
    "postcode",
    "amount",
    "campaign",
    "campaign id",
    "anonymous (y/n)",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const parts = r.name.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    lines.push(
      [
        csvCell(new Date(r.date).toISOString().slice(0, 10)),
        csvCell(firstName),
        csvCell(lastName),
        csvCell(r.business),
        csvCell(r.email),
        csvCell(r.postcode),
        csvCell(r.amount.toFixed(2)),
        csvCell(r.campaignTitle),
        csvCell(r.campaignId),
        csvCell(r.anonymous ? "Y" : "N"),
      ].join(","),
    );
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="kitup-donors-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
