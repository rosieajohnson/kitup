import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    if (error.code === "23505") return rows.length; // already recorded
    console.error("recordPurchasesFromSession failed:", error.message);
    return 0;
  }
  return rows.length;
}

/**
 * Mark every purchase from a Checkout session as refunded. Refunded
 * purchases are kept for the record but excluded from all funding
 * totals (migration 0015), so the items become available to fund again.
 * Idempotent — only rows not already refunded are updated.
 */
export async function markSessionRefunded(
  sessionId: string,
  client: SupabaseClient,
): Promise<number> {
  const { data, error } = await client
    .from("purchases")
    .update({ refunded_at: new Date().toISOString() })
    .eq("stripe_checkout_session_id", sessionId)
    .is("refunded_at", null)
    .select("id");
  if (error) {
    console.error("markSessionRefunded failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
