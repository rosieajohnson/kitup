import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2, MapPin, AlertTriangle } from "lucide-react";
import { getCampaign } from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { DELIVERY_CONFIRM_READY } from "@/lib/profile";
import { money, moneyExact, shortDate, deadlineLabel } from "@/lib/format";
import { PublishButton } from "@/components/publish-button";
import { DeliveryConfirm } from "@/components/delivery-confirm";

export const metadata = { title: "Review & go live" };

type Params = { params: Promise<{ id: string }> };

export default async function ReviewCampaignPage({ params }: Params) {
  const { id } = await params;

  // This flow only makes sense with a backend + signed-in school.
  if (!isSupabaseConfigured()) redirect("/dashboard");

  const viewer = await getViewer();
  if (!viewer.userId) redirect("/sign-in");

  const campaign = await getCampaign(id);
  // RLS lets the owner read its own draft; anyone else gets null here.
  if (!campaign || campaign.school.id !== viewer.schoolId) notFound();

  // Already public — nothing to confirm.
  if (campaign.status === "live") redirect(`/campaigns/${id}`);

  // Delivery address must be confirmed before going live.
  const supabase = await createClient();
  const { data: school } = await supabase
    .from("schools")
    .select("address, suburb, postcode, delivery_confirmed")
    .eq("id", viewer.schoolId)
    .single();
  const addressParts = [school?.address, school?.suburb, school?.postcode]
    .filter((p) => p && String(p).trim())
    .join(", ");
  const addressConfirmed =
    !DELIVERY_CONFIRM_READY ||
    Boolean(school?.delivery_confirmed && school?.address?.trim());
  const blockedReason = addressConfirmed
    ? undefined
    : "Confirm your delivery address before going live.";

  return (
    <div className="container-page py-10 sm:py-14">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
      </Link>

      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Review &amp; go live
      </h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Check everything below. Once you go live, donors can see and fund this
        campaign.
      </p>

      <div className="mt-8 max-w-2xl space-y-6">
        {/* Details */}
        <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">
            {campaign.title}
          </h2>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-soft">
            <Calendar className="h-4 w-4" aria-hidden />
            Closes {shortDate(campaign.deadline)} · {deadlineLabel(
              campaign.deadline,
            )}
          </p>
          <p className="mt-4 whitespace-pre-line text-ink-soft">
            {campaign.description || (
              <span className="italic text-ink-faint">
                No description added.
              </span>
            )}
          </p>
        </section>

        {/* Items */}
        <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">
            Items ({campaign.items.length})
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {campaign.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">{item.title}</span>
                  <span className="text-ink-faint">
                    {" "}
                    · {item.quantity_needed} × {moneyExact(item.cost)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-ink tabular-nums">
                  {moneyExact(item.cost * item.quantity_needed)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <span className="text-sm font-semibold text-ink">Funding goal</span>
            <span className="font-display text-xl font-bold text-ink tabular-nums">
              {money(campaign.funding_goal)}
            </span>
          </div>
        </section>

        {/* Delivery address */}
        <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">
            Delivery address
          </h2>
          <p className="mt-1 inline-flex items-start gap-1.5 text-sm text-ink-soft">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {addressParts || (
              <span className="italic text-ink-faint">No address on file.</span>
            )}
          </p>
          {addressConfirmed ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-turf-dark">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Confirmed — ready to ship gear here.
            </p>
          ) : (
            <div className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-4">
              <p className="inline-flex items-start gap-2 text-sm font-medium text-coral-dark">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {school?.address?.trim()
                  ? "Is the delivery address above correct? Confirm it to go live, or edit it first. Campaigns can't go live until the address is confirmed."
                  : "Add a delivery address before going live, so funded gear has a verified place to ship to."}
              </p>
              <DeliveryConfirm
                campaignId={campaign.id}
                hasAddress={Boolean(school?.address?.trim())}
              />
            </div>
          )}
        </section>

        {/* Confirm + publish */}
        <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <p className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-ink-soft">
            <CheckCircle2 className="h-4 w-4 text-turf-dark" aria-hidden />
            This campaign is a draft — only you can see it right now.
          </p>
          <PublishButton campaignId={campaign.id} blockedReason={blockedReason} />
          <p className="mt-4 text-sm text-ink-soft">
            Need to change something?{" "}
            <Link
              href={`/dashboard/campaigns/${campaign.id}/edit`}
              className="font-semibold text-coral hover:text-coral-dark"
            >
              Edit this campaign
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
