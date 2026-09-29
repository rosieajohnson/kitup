"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { computeFees } from "@/lib/fees";

export interface CartLineInput {
  itemId: string;
  campaignId: string;
  quantity: number;
}

export interface GuestInput {
  name: string;
  email: string;
  password: string;
  createAccount: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Create a Stripe Checkout session for the cart. Resolves who the
 * donation belongs to:
 *   - signed-in donor  -> their account
 *   - guest email that already has a donor account -> that account
 *   - new guest opting in -> create a donor account (email + password)
 *   - new guest opting out -> recorded as a guest (name + email only)
 * The resolved donor_id / guest details are stored in session metadata
 * so the purchase is recorded correctly after payment.
 */
export async function createCheckoutSession(
  cart: CartLineInput[],
  guest?: GuestInput,
  anonymous = false,
  coverCosts = true,
  agreedToTerms = false,
): Promise<{ error?: string; url?: string }> {
  if (!isSupabaseConfigured()) return { error: "Funding needs Supabase connected." };
  if (!isStripeConfigured()) return { error: "Payments aren't set up yet." };
  if (!cart || cart.length === 0) return { error: "Your cart is empty." };
  if (!agreedToTerms) {
    return { error: "You must agree to the Terms & Conditions to donate." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let donorId: string | null = null;
  let guestName: string | null = null;
  let guestEmail: string | null = null;
  let receiptEmail: string | undefined;

  if (user) {
    // Signed in — must be a donor account (schools don't fund).
    const { data: donor } = await supabase
      .from("donors")
      .select("id, contact_email")
      .eq("id", user.id)
      .single();
    if (!donor) {
      return { error: "Only donor accounts can fund. Sign out to donate as a guest." };
    }
    donorId = user.id;
    receiptEmail = donor.contact_email ?? user.email ?? undefined;
  } else {
    // Guest checkout — need name + email.
    const name = guest?.name?.trim() ?? "";
    const email = guest?.email?.trim() ?? "";
    if (!name || !email) return { error: "Enter your name and email to donate." };
    if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
    receiptEmail = email;

    const admin = createAdminClient();
    // Recognise an existing donor by email (no password needed).
    const { data: existing } = await admin
      .from("donors")
      .select("id")
      .eq("contact_email", email)
      .maybeSingle();

    if (existing) {
      donorId = existing.id;
    } else if (guest?.createAccount) {
      const password = guest?.password ?? "";
      if (password.length < 6) {
        return {
          error:
            "Password must be at least 6 characters — or untick 'create an account' to donate as a guest.",
        };
      }
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: "donor", name },
        });
      if (createErr || !created?.user) {
        // Email likely already registered (e.g. as a school) — fall back
        // to recording as a guest so the donation still goes through.
        guestName = name;
        guestEmail = email;
      } else {
        donorId = created.user.id;
      }
    } else {
      // Opted out — pure guest donation.
      guestName = name;
      guestEmail = email;
    }
  }

  // Validate + price every line from the DB.
  const lineItems = [];
  const mapping: { i: string; c: string; q: number; a: number }[] = [];
  const db = user ? supabase : createAdminClient();

  // Reject funding for campaigns that aren't open: only 'live' campaigns whose
  // deadline hasn't passed accept money.
  const campaignIds = Array.from(new Set(cart.map((l) => l.campaignId)));
  const { data: cartCamps } = await db
    .from("campaigns")
    .select("id, title, status, deadline")
    .in("id", campaignIds);
  const campById = new Map((cartCamps ?? []).map((c) => [c.id, c]));
  const nowMs = Date.now();

  for (const line of cart) {
    const quantity = Math.floor(line.quantity);
    if (!quantity || quantity < 1) continue;
    const { data: item } = await db
      .from("items")
      .select("id, title, cost, campaign_id, quantity_needed")
      .eq("id", line.itemId)
      .eq("campaign_id", line.campaignId)
      .single();
    if (!item) return { error: "An item in your cart no longer exists." };

    // The campaign must be open (live and not past its deadline).
    const camp = campById.get(item.campaign_id);
    if (!camp || camp.status !== "live") {
      return {
        error: `"${item.title}" belongs to a campaign that isn't accepting funding.`,
      };
    }
    if (camp.deadline && new Date(camp.deadline).getTime() < nowMs) {
      return {
        error: `"${camp.title ?? "That campaign"}" has closed and is no longer accepting funding — please remove its items from your cart.`,
      };
    }

    // Don't let anyone fund more than the campaign still needs.
    const { data: funding } = await db
      .from("item_funding")
      .select("quantity_funded")
      .eq("item_id", item.id)
      .maybeSingle();
    const funded = funding ? Number(funding.quantity_funded) : 0;
    const remaining = Math.max(0, item.quantity_needed - funded);
    if (quantity > remaining) {
      return {
        error:
          remaining === 0
            ? `"${item.title}" is already fully funded — please remove it from your cart.`
            : `Only ${remaining} more of "${item.title}" ${remaining === 1 ? "is" : "are"} needed — please lower the quantity.`,
      };
    }

    const unitAmount = Math.round(Number(item.cost) * 100);
    if (unitAmount <= 0) continue;
    lineItems.push({
      quantity,
      price_data: {
        currency: "aud",
        product_data: { name: item.title },
        unit_amount: unitAmount,
      },
    });
    mapping.push({
      i: item.id,
      c: item.campaign_id,
      q: quantity,
      a: (unitAmount / 100) * quantity,
    });
  }
  if (lineItems.length === 0) return { error: "Nothing to pay for." };

  // Optional "Help cover our fundraising costs" fee (donor can opt out at
  // checkout). Recomputed here from the server-priced donation total, and added
  // as its own Stripe line item — deliberately NOT in `mapping`, so it is never
  // recorded as item funding or shown in the school's invoice.
  if (coverCosts) {
    const donation = mapping.reduce((sum, m) => sum + m.a, 0);
    const fee = computeFees(donation);
    if (fee.total > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "aud",
          product_data: { name: "Help cover our fundraising costs" },
          unit_amount: Math.round(fee.total * 100),
        },
      });
    }
  }

  const cartJson = JSON.stringify(mapping);
  const metadata: Record<string, string> = {
    donor_id: donorId ?? "",
    guest_name: guestName ?? "",
    guest_email: guestEmail ?? "",
    anonymous: anonymous ? "1" : "",
    terms_accepted_at: new Date().toISOString(),
    cart_chunks: String(Math.ceil(cartJson.length / 450)),
  };
  for (let i = 0; i * 450 < cartJson.length; i++) {
    metadata[`cart_${i}`] = cartJson.slice(i * 450, (i + 1) * 450);
  }

  const stripe = getStripe()!;
  const hdrs = await headers();
  const origin =
    hdrs.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: receiptEmail,
    // Email a Stripe payment receipt to the donor/guest.
    payment_intent_data: receiptEmail
      ? { receipt_email: receiptEmail }
      : undefined,
    metadata,
    success_url: `${origin}/funded?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  });

  if (!session.url) return { error: "Could not start checkout." };
  return { url: session.url };
}

/**
 * Does this email already belong to a donor account? Used by the cart to
 * show "welcome back" vs "you're new" as the guest types their email.
 * Returns only a boolean — no account details are exposed.
 */
export async function lookupDonorEmail(
  email: string,
): Promise<{ exists: boolean }> {
  const e = email?.trim() ?? "";
  if (!isSupabaseConfigured() || !EMAIL_RE.test(e)) return { exists: false };
  const admin = createAdminClient();
  const { data } = await admin
    .from("donors")
    .select("id")
    .eq("contact_email", e)
    .maybeSingle();
  return { exists: Boolean(data) };
}
