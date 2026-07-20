import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdminReconciliation } from "@/lib/notify";

/**
 * Campaign reconciliation (migration 0028). Gated OFF until the migration is
 * applied — flip to true afterwards. Until then reconcileCampaign() no-ops so
 * nothing reads/writes campaigns.reconciled_at before it exists.
 */
export const RECONCILE_READY = false;

function invoiceRef(sessionId: string | null): string {
  return "KU-" + (sessionId ?? "").slice(-10).toUpperCase();
}

/**
 * Close a campaign and email the admin its reconciliation ledger — exactly
 * once. The caller passes a service-role client. Idempotent: it atomically
 * claims the campaign by setting reconciled_at where it's still null, so the
 * fully-funded path and the deadline cron can both call this and only the first
 * actually sends. Best-effort; returns true only if it sent.
 */
export async function reconcileCampaign(
  admin: SupabaseClient,
  campaignId: string,
  reason: "fully funded" | "deadline reached",
): Promise<boolean> {
  if (!RECONCILE_READY) return false;

  const claimedAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from("campaigns")
    .update({ reconciled_at: claimedAt })
    .eq("id", campaignId)
    .is("reconciled_at", null)
    .select("id, title, school_id");
  if (!claimed || claimed.length === 0) return false; // already reconciled
  const camp = claimed[0];

  // School + delivery address (street + ACARA locality).
  const { data: school } = await admin
    .from("schools")
    .select(
      "school, address, suburb, postcode, abn, abn_entity_name, delivery_confirmed",
    )
    .eq("id", camp.school_id)
    .maybeSingle();

  let locality: string | null = null;
  if (school) {
    try {
      const { data: chk } = await admin.rpc("check_school_address", {
        p_school: school.school,
        p_address: null,
        p_suburb: school.suburb ?? null,
        p_postcode: school.postcode ?? null,
      });
      if (chk?.status === "match" && chk?.matched_address) {
        locality = chk.matched_address as string;
      }
    } catch {
      /* best-effort */
    }
    if (!locality) {
      locality = [school.suburb, school.postcode].filter(Boolean).join(" ") || null;
    }
  }
  const deliveryAddress = school
    ? [school.address, locality].filter(Boolean).join(", ") || null
    : null;

  // Funded purchases (exclude refunded), oldest first.
  const { data: purchases } = await admin
    .from("purchases")
    .select("created_at, quantity, amount, stripe_checkout_session_id, item_id")
    .eq("campaign_id", campaignId)
    .is("refunded_at", null)
    .order("created_at", { ascending: true });

  const itemIds = Array.from(
    new Set((purchases ?? []).map((p) => p.item_id)),
  );
  const { data: its } = itemIds.length
    ? await admin
        .from("items")
        .select("id, title, product:hart_sport_products(hart_sku)")
        .in("id", itemIds)
    : { data: [] };
  const itemById = new Map((its ?? []).map((i) => [i.id, i]));

  const lines = (purchases ?? []).map((p) => {
    const it = itemById.get(p.item_id) as
      | { title?: string; product?: { hart_sku?: string } | { hart_sku?: string }[] }
      | undefined;
    const product = it && (Array.isArray(it.product) ? it.product[0] : it.product);
    return {
      dateISO: p.created_at as string,
      invoiceRef: invoiceRef(p.stripe_checkout_session_id),
      sku: product?.hart_sku ?? null,
      itemTitle: it?.title ?? "an item",
      quantity: p.quantity as number,
      amount: Number(p.amount),
    };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const donationCount = new Set(lines.map((l) => l.invoiceRef)).size;

  // Item coverage.
  const { data: items } = await admin
    .from("items")
    .select("id, quantity_needed")
    .eq("campaign_id", campaignId);
  const { data: funding } = items?.length
    ? await admin
        .from("item_funding")
        .select("item_id, quantity_funded")
        .in(
          "item_id",
          items.map((i) => i.id),
        )
    : { data: [] };
  const fundedById = new Map(
    (funding ?? []).map((f) => [f.item_id, Number(f.quantity_funded)]),
  );
  const itemsTotal = items?.length ?? 0;
  const itemsFunded = (items ?? []).filter(
    (i) => (fundedById.get(i.id) ?? 0) >= i.quantity_needed,
  ).length;

  return notifyAdminReconciliation({
    campaignTitle: camp.title ?? "a campaign",
    reason,
    schoolName: school?.school ?? null,
    deliveryAddress,
    deliveryConfirmed: Boolean(school?.delivery_confirmed),
    abn: school?.abn ?? null,
    abnEntityName: school?.abn_entity_name ?? null,
    reportRef: "KU-R-" + campaignId.replace(/-/g, "").slice(-6).toUpperCase(),
    dateISO: claimedAt,
    lines,
    total,
    itemsFunded,
    itemsTotal,
    donationCount,
  });
}
