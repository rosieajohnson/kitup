import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClearCart } from "@/components/cart/clear-cart";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { recordPurchasesFromSession } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Thank you" };

type SearchParams = { searchParams: Promise<{ session_id?: string }> };

export default async function FundedPage({ searchParams }: SearchParams) {
  const { session_id } = await searchParams;

  // Verify the payment with Stripe and record the purchases. This is the
  // local fallback for the webhook; it's idempotent, so the webhook (in
  // production) recording the same session is harmless.
  let confirmed = false;
  if (session_id && isStripeConfigured()) {
    const stripe = getStripe()!;
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status === "paid") {
        // Guests have no session, so record with the service-role client;
        // donor_id / guest details come from the session metadata.
        await recordPurchasesFromSession(session, createAdminClient());
        confirmed = true;
      }
    } catch {
      // fall through to the generic thank-you
    }
  }

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <ClearCart />
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-turf/15 text-turf-dark">
          <PartyPopper className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Thank you for funding!
        </h1>
        <p className="mt-2 text-ink-soft">
          {confirmed
            ? "Your payment is confirmed and the kit is on its way to the schools you backed."
            : "Your payment went through — the campaign totals update within a few moments."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/#browse">
            <Button size="lg" className="w-full">
              Browse more campaigns
            </Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="lg" className="w-full">
              Back home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
