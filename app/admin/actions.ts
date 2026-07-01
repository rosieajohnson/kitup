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

  let marked = 0;
  const refunds = await stripe.refunds.list({ limit: 100 });
  for (const r of refunds.data) {
    if (r.status !== "succeeded" || !r.payment_intent) continue;
    const pi =
      typeof r.payment_intent === "string"
        ? r.payment_intent
        : r.payment_intent.id;
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: pi,
      limit: 1,
    });
    const sessionId = sessions.data[0]?.id;
    if (sessionId) marked += await markSessionRefunded(sessionId, admin);
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { marked };
}
