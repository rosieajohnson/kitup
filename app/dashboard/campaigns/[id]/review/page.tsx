import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2 } from "lucide-react";
import { getCampaign } from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { money, moneyExact, shortDate, deadlineLabel } from "@/lib/format";
import { PublishButton } from "@/components/publish-button";

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
  if (!campaign || campaign.school.id !== viewer.userId) notFound();

  // Already public — nothing to confirm.
  if (campaign.status === "live") redirect(`/campaigns/${id}`);

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

        {/* Confirm + publish */}
        <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <p className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-ink-soft">
            <CheckCircle2 className="h-4 w-4 text-turf-dark" aria-hidden />
            This campaign is a draft — only you can see it right now.
          </p>
          <PublishButton campaignId={campaign.id} />
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
