"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { markSessionRefunded } from "@/lib/payments";

/**
 * Reconcile refunds from Stripe (ASF admin only). Pulls recent refunds,
 * finds the Checkout session behind each, and marks its purchases
 * refunded — so refunded items free up without relying on the webhook.
 */
export async function syncRefunds(): Promise<{
  marked?: number;
  error?: string;
}> {
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return { error: "Payments aren't fully configured." };
  }
  const viewer = await getViewer();
  if (!viewer.isAdmin) return { error: "Admins only." };

  const stripe = getStripe()!;
  const admin = createAdminClient();

  // Sum the refunded amount per payment_intent so partial and repeated
  // refunds are handled correctly (cumulative), not treated as full.
  const byPI = new Map<string, number>(); // payment_intent -> refunded cents
  const refunds = await stripe.refunds.list({ limit: 100 });
  for (const r of refunds.data) {
    if (r.status !== "succeeded" || !r.payment_intent) continue;
    const pi =
      typeof r.payment_intent === "string"
        ? r.payment_intent
        : r.payment_intent.id;
    byPI.set(pi, (byPI.get(pi) ?? 0) + r.amount);
  }

  let marked = 0;
  for (const [pi, cents] of byPI) {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: pi,
      limit: 1,
    });
    const sessionId = sessions.data[0]?.id;
    if (sessionId) {
      marked += await markSessionRefunded(sessionId, admin, cents / 100);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { marked };
}

/** Archive a campaign — removes it from the public site (keeps the record +
 *  reports). ASF admin only. Reversible via restoreCampaign. */
export async function archiveCampaign(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.isAdmin) return;
  const id = String(formData.get("campaign_id") ?? "");
  if (!id) return;
  const { error } = await createAdminClient()
    .from("campaigns")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) console.error("archiveCampaign failed:", error.message);
  revalidatePath("/admin");
  revalidatePath("/");
}

/** Restore an archived campaign back to live. ASF admin only. */
export async function restoreCampaign(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.isAdmin) return;
  const id = String(formData.get("campaign_id") ?? "");
  if (!id) return;
  const { error } = await createAdminClient()
    .from("campaigns")
    .update({ status: "live" })
    .eq("id", id);
  if (error) console.error("restoreCampaign failed:", error.message);
  revalidatePath("/admin");
  revalidatePath("/");
}
