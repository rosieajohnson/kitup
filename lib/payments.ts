import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdminDonation, notifyAdminCampaignFunded } from "@/lib/notify";

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
  client: SupabaseClient,
  lines: CartMapLine[],
): Promise<void> {
  try {
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
      client
        .from("campaigns")
        .select("id, title, school_id")
        .in("id", campaignIds),
      client.from("items").select("id, title").in("id", itemIds),
    ]);
    const schoolIds = Array.from(
      new Set((camps ?? []).map((c) => c.school_id).filter(Boolean)),
    );
    const { data: schools } = schoolIds.length
      ? await client.from("schools").select("id, school").in("id", schoolIds)
      : { data: [] };

    const campById = new Map((camps ?? []).map((c) => [c.id, c]));
    const itemTitleById = new Map((its ?? []).map((i) => [i.id, i.title]));
    const schoolById = new Map((schools ?? []).map((s) => [s.id, s.school]));

    // 1) donation notice (every donation)
    await notifyAdminDonation({
      donorLabel,
      total: (session.amount_total ?? 0) / 100,
      sessionId: session.id,
      lines: lines.map((l) => ({
        campaignTitle: campById.get(l.c)?.title ?? "a campaign",
        itemTitle: itemTitleById.get(l.i) ?? "an item",
        quantity: l.q,
        unitPrice: l.q > 0 ? l.a / l.q : l.a,
        amount: l.a,
      })),
    });

    // 2) fully-funded notice — check each campaign touched by this donation
    for (const cid of campaignIds) {
      const { data: items } = await client
        .from("items")
        .select("id, title, cost, quantity_needed")
        .eq("campaign_id", cid);
      if (!items || items.length === 0) continue;

      const { data: funding } = await client
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
      const { data: cf } = await client
        .from("campaign_funding")
        .select("amount_raised")
        .eq("campaign_id", cid)
        .maybeSingle();
      await notifyAdminCampaignFunded({
        campaignTitle: camp?.title ?? "a campaign",
        schoolName: camp ? (schoolById.get(camp.school_id) ?? null) : null,
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
