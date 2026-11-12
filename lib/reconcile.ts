import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  notifyAdminReconciliation,
  type CampaignImpact,
  type SchoolDemographics,
} from "@/lib/notify";
import { acaraMatchForSchool, DEMOGRAPHICS_READY } from "@/lib/geocode";
import { CAMPAIGN_IMPACT_READY } from "@/lib/campaign-fields";
import { PARTIAL_FUNDING_READY } from "@/lib/funding";

/**
 * Campaign reconciliation (migration 0028). Gated OFF until the migration is
 * applied — flip to true afterwards. Until then reconcileCampaign() no-ops so
 * nothing reads/writes campaigns.reconciled_at before it exists.
 */
export const RECONCILE_READY = true;

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
  reason: "fully funded" | "deadline reached" | "closed early",
): Promise<boolean> {
  if (!RECONCILE_READY) return false;

  const claimedAt = new Date().toISOString();
  // Impact answers live on the campaign (migration 0030); include them only when
  // that column set is ready so we never select a column before it exists.
  const campSelect =
    "id, title, school_id" +
    (CAMPAIGN_IMPACT_READY
      ? ", students_reached, barrier, students_missing_out, usage_context, usage_frequency, participation_goal"
      : "");
  const { data: claimed } = await admin
    .from("campaigns")
    .update({ reconciled_at: claimedAt })
    .eq("id", campaignId)
    .is("reconciled_at", null)
    .select(campSelect);
  if (!claimed || claimed.length === 0) return false; // already reconciled
  const camp = claimed[0] as unknown as {
    id: string;
    title: string | null;
    school_id: string;
    students_reached?: number | null;
    barrier?: string | null;
    students_missing_out?: string | null;
    usage_context?: string | null;
    usage_frequency?: string | null;
    participation_goal?: string | null;
  };

  // School-provided need/impact (from the campaign row).
  const impact: CampaignImpact | null = CAMPAIGN_IMPACT_READY
    ? {
        studentsReached: camp.students_reached ?? null,
        barrier: camp.barrier ?? "",
        studentsMissingOut: camp.students_missing_out ?? "",
        usageContext: camp.usage_context ?? "",
        usageFrequency: camp.usage_frequency ?? "",
        participationGoal: camp.participation_goal ?? "",
      }
    : null;

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

  // ACARA equity markers (from the registry; null until it's populated).
  let demographics: SchoolDemographics | null = null;
  if (DEMOGRAPHICS_READY && school) {
    try {
      const m = await acaraMatchForSchool(admin, {
        school: school.school,
        postcode: school.postcode,
      });
      if (m) {
        demographics = {
          remoteness: m.remoteness ?? null,
          totalEnrolments: m.total_enrolments ?? null,
          icsea: m.icsea ?? null,
          icseaPercentile: m.icsea_percentile ?? null,
          seaBottomQuarter: m.sea_bottom_quarter ?? null,
          indigenousPct: m.indigenous_pct ?? null,
          lbotePct: m.lbote_pct ?? null,
        };
      }
    } catch {
      /* best-effort */
    }
  }

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

  // Item coverage + (per-dollar) fulfilment split.
  const { data: itemsRaw } = await admin
    .from("items")
    .select(
      "id, title, cost, quantity_needed, product:hart_sport_products(hart_sku)",
    )
    .eq("campaign_id", campaignId);
  const items = (itemsRaw ?? []) as unknown as {
    id: string;
    title: string;
    cost: number;
    quantity_needed: number;
    product?: { hart_sku?: string } | { hart_sku?: string }[] | null;
  }[];
  const { data: funding } = items.length
    ? await admin
        .from("item_funding")
        .select("item_id, quantity_funded, amount_raised")
        .in(
          "item_id",
          items.map((i) => i.id),
        )
    : { data: [] };
  const fundById = new Map(
    (funding ?? []).map((f) => [
      f.item_id,
      { qty: Number(f.quantity_funded), amount: Number(f.amount_raised) },
    ]),
  );
  const itemsTotal = items.length;

  // Per-dollar: split items into fully funded (buy & ship) vs partially funded
  // (their contributions become one Hart Sport gift card). Whole-unit: count
  // items whose full quantity is funded.
  let itemsFunded: number;
  let fulfilment:
    | {
        items: {
          title: string;
          sku: string | null;
          totalCost: number;
          raised: number;
          funded: boolean;
        }[];
        giftCardTotal: number;
      }
    | null = null;

  if (PARTIAL_FUNDING_READY) {
    const fitems = items
      .map((i) => {
        const prod = Array.isArray(i.product) ? i.product[0] : i.product;
        const totalCost = Math.round(Number(i.cost) * i.quantity_needed * 100) / 100;
        const raised = fundById.get(i.id)?.amount ?? 0;
        return {
          title: i.title,
          sku: prod?.hart_sku ?? null,
          totalCost,
          raised: Math.round(raised * 100) / 100,
          funded: totalCost > 0 && raised >= totalCost,
        };
      })
      .filter((x) => x.raised > 0 || x.funded);
    itemsFunded = fitems.filter((x) => x.funded).length;
    const giftCardTotal =
      Math.round(
        fitems.filter((x) => !x.funded).reduce((s, x) => s + x.raised, 0) * 100,
      ) / 100;
    fulfilment = { items: fitems, giftCardTotal };
  } else {
    itemsFunded = items.filter(
      (i) => (fundById.get(i.id)?.qty ?? 0) >= i.quantity_needed,
    ).length;
  }

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
    demographics,
    impact,
    fulfilment,
  });
}
