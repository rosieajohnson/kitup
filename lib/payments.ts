import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdminInvoice, notifyAdminCampaignFunded } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupAbn } from "@/lib/abr";

interface CartMapLine {
  i: string; // item_id
  c: string; // campaign_id
  q: number; // quantity
  a: number; // amount (dollars)
}

/**
 * Record the purchases for a paid Checkout session. Idempotent — the
 * unique (session, item) index + ignoreDuplicates means recording the
 * same session twice is a no-op.
 *
 * The caller passes the Supabase client to write with:
 *   - success page (verify-on-return): the donor's own session client,
 *     so RLS (auth.uid() = donor_id) authorises the insert — no
 *     service-role key needed for local/dev.
 *   - webhook (production): the service-role admin client, since there
 *     is no user session in a webhook.
 */
export async function recordPurchasesFromSession(
  session: Stripe.Checkout.Session,
  client: SupabaseClient,
): Promise<number> {
  if (session.payment_status !== "paid") return 0;

  const meta = session.metadata ?? {};
  const donorId = meta.donor_id || null;
  const guestName = meta.guest_name || null;
  const guestEmail = meta.guest_email || null;
  const anonymous = meta.anonymous === "1";
  // Need either an account or guest contact to attribute the donation.
  if (!donorId && !guestEmail) return 0;

  // Reassemble the chunked cart JSON.
  const chunkCount = Number(meta.cart_chunks ?? "0");
  let json = "";
  for (let i = 0; i < chunkCount; i++) json += meta[`cart_${i}`] ?? "";

  let lines: CartMapLine[];
  try {
    lines = JSON.parse(json) as CartMapLine[];
  } catch {
    return 0;
  }
  if (!Array.isArray(lines) || lines.length === 0) return 0;

  const rows = lines
    .filter((l) => l.i && l.c && l.q > 0 && l.a > 0)
    .map((l) => ({
      stripe_checkout_session_id: session.id,
      donor_id: donorId,
      guest_name: donorId ? null : guestName,
      guest_email: donorId ? null : guestEmail,
      anonymous,
      item_id: l.i,
      campaign_id: l.c,
      quantity: l.q,
      amount: l.a,
    }));
  if (rows.length === 0) return 0;

  // Plain insert. The partial unique index on (session, item) makes a
  // repeat (e.g. a page refresh or a webhook retry) raise 23505, which
  // we treat as "already recorded" — so this stays idempotent without
  // needing ON CONFLICT (which can't target a partial index via PostgREST).
  const { error } = await client.from("purchases").insert(rows);
  if (error) {
    if (error.code === "23505") return rows.length; // already recorded — don't re-notify
    console.error("recordPurchasesFromSession failed:", error.message);
    return 0;
  }

  // We are the first writer to record this session — notify the admin exactly
  // once. Best-effort: a mail failure must not fail the payment recording.
  await notifyAdmin(session, client, lines);
  return rows.length;
}

/**
 * Email the ASF admin about a just-recorded donation, and — if the donation
 * completes a campaign's goal — a "fully funded" note too. Never throws.
 */
async function notifyAdmin(
  session: Stripe.Checkout.Session,
  _client: SupabaseClient,
  lines: CartMapLine[],
): Promise<void> {
  try {
    // Enrichment reads use the service-role client so this works from both the
    // donor's success page and the webhook, and can read school_registry /
    // the catalogue regardless of the caller's RLS.
    const admin = createAdminClient();
    const meta = session.metadata ?? {};
    const anonymous = meta.anonymous === "1";
    const payerName = session.customer_details?.name || meta.guest_name || null;
    const payerEmail =
      session.customer_details?.email || meta.guest_email || null;
    let donorLabel =
      payerName && payerEmail
        ? `${payerName} <${payerEmail}>`
        : payerName || payerEmail || "A donor";
    if (anonymous) donorLabel += " (anonymous to public)";

    const campaignIds = Array.from(new Set(lines.map((l) => l.c)));
    const itemIds = Array.from(new Set(lines.map((l) => l.i)));

    const [{ data: camps }, { data: its }] = await Promise.all([
      admin
        .from("campaigns")
        .select("id, title, school_id")
        .in("id", campaignIds),
      admin
        .from("items")
        .select("id, title, product:hart_sport_products(hart_sku)")
        .in("id", itemIds),
    ]);
    const schoolIds = Array.from(
      new Set((camps ?? []).map((c) => c.school_id).filter(Boolean)),
    );
    const { data: schools } = schoolIds.length
      ? await admin
          .from("schools")
          .select(
            "id, school, address, suburb, postcode, abn, abn_entity_name, abn_verified",
          )
          .in("id", schoolIds)
      : { data: [] };

    const campById = new Map((camps ?? []).map((c) => [c.id, c]));
    const itemById = new Map((its ?? []).map((i) => [i.id, i]));
    const schoolById = new Map((schools ?? []).map((s) => [s.id, s]));

    // Per-school: resolve the ACARA-registered address + ABN cross-check once.
    const schoolInfo = new Map<
      string,
      { acaraAddress: string | null; abnCrossCheck: string }
    >();
    await Promise.all(
      (schools ?? []).map(async (s) => {
        let acaraAddress: string | null = null;
        try {
          const { data: chk } = await admin.rpc("check_school_address", {
            p_school: s.school,
            p_address: s.address ?? null,
            p_suburb: s.suburb ?? null,
            p_postcode: s.postcode ?? null,
          });
          if (chk?.status === "match" && chk?.matched_address) {
            acaraAddress = chk.matched_address as string;
          }
        } catch {
          /* best-effort */
        }
        if (!acaraAddress) {
          acaraAddress =
            [s.address, s.suburb, s.postcode].filter(Boolean).join(" ") || null;
        }
        schoolInfo.set(s.id, {
          acaraAddress,
          abnCrossCheck: await buildAbnCrossCheck(s),
        });
      }),
    );

    // 1) One invoice per funded school (every donation).
    const linesBySchool = new Map<string, CartMapLine[]>();
    for (const l of lines) {
      const sid = campById.get(l.c)?.school_id;
      if (!sid) continue;
      (linesBySchool.get(sid) ?? linesBySchool.set(sid, []).get(sid)!).push(l);
    }
    const dateISO = new Date().toISOString();
    for (const [sid, sLines] of linesBySchool) {
      const school = schoolById.get(sid);
      const info = schoolInfo.get(sid) ?? {
        acaraAddress: null,
        abnCrossCheck: "No ABN on file.",
      };
      const invLines = sLines.map((l) => {
        const it = itemById.get(l.i);
        const product = Array.isArray(it?.product) ? it?.product[0] : it?.product;
        return {
          sku: product?.hart_sku ?? null,
          campaignTitle: campById.get(l.c)?.title ?? "a campaign",
          itemTitle: it?.title ?? "an item",
          quantity: l.q,
          unitPrice: l.q > 0 ? l.a / l.q : l.a,
          amount: l.a,
        };
      });
      await notifyAdminInvoice({
        schoolName: school?.school ?? "the school",
        acaraAddress: info.acaraAddress,
        abn: school?.abn ?? null,
        abnEntityName: school?.abn_entity_name ?? null,
        abnCrossCheck: info.abnCrossCheck,
        donorLabel,
        sessionId: session.id,
        dateISO,
        lines: invLines,
        total: invLines.reduce((s, x) => s + x.amount, 0),
      });
    }

    // 2) fully-funded notice — check each campaign touched by this donation
    for (const cid of campaignIds) {
      const { data: items } = await admin
        .from("items")
        .select("id, title, cost, quantity_needed")
        .eq("campaign_id", cid);
      if (!items || items.length === 0) continue;

      const { data: funding } = await admin
        .from("item_funding")
        .select("item_id, quantity_funded")
        .in(
          "item_id",
          items.map((i) => i.id),
        );
      const fundedById = new Map(
        (funding ?? []).map((f) => [f.item_id, Number(f.quantity_funded)]),
      );
      const fullyFunded = items.every(
        (i) => (fundedById.get(i.id) ?? 0) >= i.quantity_needed,
      );
      if (!fullyFunded) continue;

      const camp = campById.get(cid);
      const { data: cf } = await admin
        .from("campaign_funding")
        .select("amount_raised")
        .eq("campaign_id", cid)
        .maybeSingle();
      await notifyAdminCampaignFunded({
        campaignTitle: camp?.title ?? "a campaign",
        schoolName: camp ? (schoolById.get(camp.school_id)?.school ?? null) : null,
        amountRaised: Number(cf?.amount_raised ?? 0),
        items: items.map((i) => ({
          title: i.title,
          quantity: i.quantity_needed,
          unitPrice: Number(i.cost),
          lineTotal: Number(i.cost) * i.quantity_needed,
        })),
      });
    }
  } catch (err) {
    console.error("notifyAdmin failed (non-fatal):", err);
  }
}

/**
 * One-line ABN cross-check for a school's invoice: confirms the ABN is
 * registered and whether its registered address (state/postcode) lines up with
 * the school's ACARA locality. Best-effort — never throws.
 */
async function buildAbnCrossCheck(school: {
  abn: string | null;
  postcode: string | null;
  abn_verified: boolean | null;
}): Promise<string> {
  if (!school.abn) return "No ABN on file.";
  const res = await lookupAbn(school.abn);
  if (!res.ok) {
    return `ABN ${school.abn} on file — not cross-checked (ABR lookup unavailable).`;
  }
  const parts: string[] = [];
  if (school.abn_verified) parts.push("ABN name matches school ✓");
  if (res.addressPostcode && school.postcode) {
    if (res.addressPostcode === school.postcode) {
      parts.push(`ABN registered postcode ${res.addressPostcode} matches ACARA ✓`);
    } else {
      parts.push(
        `⚠ ABN registered address (${[res.addressState, res.addressPostcode]
          .filter(Boolean)
          .join(" ")}) differs from ACARA postcode ${school.postcode} — please verify`,
      );
    }
  } else if (res.addressState) {
    parts.push(
      `ABN registered in ${res.addressState}${
        res.addressPostcode ? ` ${res.addressPostcode}` : ""
      }.`,
    );
  }
  return parts.join("; ") || `ABN ${school.abn} active.`;
}

/**
 * Free up funded items when a Checkout session is refunded — supports PARTIAL
 * refunds. Given the cumulative dollars refunded for the session, it marks
 * whole purchase rows refunded (largest first) up to that amount. Refunded
 * rows are kept for the record but excluded from all funding totals
 * (migration 0015), so the items become available to fund again.
 *
 * Omit `refundedAmount` to refund the whole session (full refund).
 *
 * Idempotent: already-refunded rows are skipped and their amounts discounted
 * from the budget, so repeated webhook deliveries and re-syncs are safe, and
 * incremental partial refunds accumulate correctly.
 *
 * Note: freeing is per funding line (a purchases row). Refunding only part of
 * a single multi-quantity line won't free a fraction of it — the whole line
 * frees only once the refund covers its amount.
 */
export async function markSessionRefunded(
  sessionId: string,
  client: SupabaseClient,
  refundedAmount?: number,
): Promise<number> {
  const { data: rows, error } = await client
    .from("purchases")
    .select("id, amount, refunded_at")
    .eq("stripe_checkout_session_id", sessionId);
  if (error || !rows) {
    if (error) console.error("markSessionRefunded fetch failed:", error.message);
    return 0;
  }

  const open = rows.filter((r) => !r.refunded_at);
  if (open.length === 0) return 0;

  let toMark: string[];
  if (refundedAmount === undefined) {
    toMark = open.map((r) => r.id as string); // full refund
  } else {
    const alreadyRefunded = rows
      .filter((r) => r.refunded_at)
      .reduce((s, r) => s + Number(r.amount), 0);
    // Only the NOT-yet-covered portion of the cumulative refund is new budget.
    let budget = refundedAmount - alreadyRefunded + 0.005; // cents tolerance
    toMark = [];
    for (const r of [...open].sort(
      (a, b) => Number(b.amount) - Number(a.amount),
    )) {
      const amt = Number(r.amount);
      if (amt <= budget) {
        toMark.push(r.id as string);
        budget -= amt;
      }
    }
  }
  if (toMark.length === 0) return 0;

  const { data, error: upErr } = await client
    .from("purchases")
    .update({ refunded_at: new Date().toISOString() })
    .in("id", toMark)
    .is("refunded_at", null)
    .select("id");
  if (upErr) {
    console.error("markSessionRefunded update failed:", upErr.message);
    return 0;
  }
  return data?.length ?? 0;
}
