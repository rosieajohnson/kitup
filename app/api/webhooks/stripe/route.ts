import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  recordPurchasesFromSession,
  markSessionRefunded,
} from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe signature verification needs the raw body + Node runtime.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    // No user session in a webhook — write with the service-role client.
    await recordPurchasesFromSession(
      event.data.object as Stripe.Checkout.Session,
      createAdminClient(),
    );
  } else if (event.type === "charge.refunded") {
    // A refund frees the funded items back up. Handle full refunds by
    // finding the Checkout session behind the charge and marking its
    // purchases refunded.
    const charge = event.data.object as Stripe.Charge;
    if (charge.refunded && charge.payment_intent) {
      const pi =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent.id;
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: pi,
        limit: 1,
      });
      const sessionId = sessions.data[0]?.id;
      if (sessionId) {
        await markSessionRefunded(sessionId, createAdminClient());
      }
    }
  }

  return NextResponse.json({ received: true });
}
