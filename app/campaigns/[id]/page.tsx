import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, Clock, ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressMeter } from "@/components/progress-meter";
import { FundableItem, type FundMode } from "@/components/fundable-item";
import { CampaignDonors } from "@/components/campaign-donors";
import { getCampaign, getCampaignDonations } from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { deadlineLabel, shortDate, money } from "@/lib/format";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return { title: "Campaign not found" };
  return { title: campaign.title, description: campaign.summary };
}

export default async function CampaignPage({ params }: Params) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  // Decide who may fund: donors only. Mock/dev keeps the optimistic demo.
  const viewer = await getViewer();
  const fundMode: FundMode = !isSupabaseConfigured()
    ? "mock"
    : viewer.role === "donor"
      ? "donor"
      : viewer.role === "school"
        ? "school"
        : "anon";

  const isOwner =
    viewer.role === "school" && viewer.userId === campaign.school.id;
  const isOwnerDraft = isOwner && campaign.status === "draft";

  // Only the owning school sees who donated.
  const donations = isOwner ? await getCampaignDonations(campaign.id) : [];

  const location = [campaign.school.suburb, campaign.school.state]
    .filter(Boolean)
    .join(", ");
  const funded = campaign.amount_raised >= campaign.funding_goal;

  return (
    <article className="container-page py-8 sm:py-12">
      <Link
        href="/#browse"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All campaigns
      </Link>

      {isOwnerDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-coral/30 bg-coral/5 p-4">
          <p className="text-sm font-medium text-ink">
            This campaign is a <strong>draft</strong> — only you can see it.
            Donors can&apos;t fund it until it&apos;s live.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/dashboard/campaigns/${campaign.id}/edit`}>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </Link>
            <Link href={`/dashboard/campaigns/${campaign.id}/review`}>
              <Button size="sm">Review &amp; go live</Button>
            </Link>
          </div>
        </div>
      )}

      {isOwner && campaign.status === "live" && (
        <div className="mb-6">
          <Link href={`/dashboard/campaigns/${campaign.id}/edit`}>
            <Button variant="outline" size="sm">
              Edit campaign
            </Button>
          </Link>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        {/* ---- Main column ---- */}
        <div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-surface-sunk">
            {campaign.cover_image && (
              <Image
                src={campaign.cover_image}
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <MapPin className="h-4 w-4" aria-hidden />
              {campaign.school.name}
              {location && <span className="text-ink-faint">· {location}</span>}
            </span>
            {campaign.school.verified ? (
              <Badge tone="turf">
                <ShieldCheck className="h-3 w-3" aria-hidden /> Verified school
              </Badge>
            ) : (
              <Badge tone="neutral">
                <ShieldAlert className="h-3 w-3" aria-hidden /> Unverified
              </Badge>
            )}
          </div>

          <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            {campaign.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
            {campaign.description}
          </p>

          {/* Items — the fundable "products" */}
          <section className="mt-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold text-ink">
                What they need
              </h2>
              <span className="text-sm text-ink-faint">
                {campaign.items.length} items
              </span>
            </div>
            <ul className="space-y-4">
              {campaign.items.map((item) => (
                <FundableItem
                  key={item.id}
                  item={item}
                  mode={fundMode}
                  campaignTitle={campaign.title}
                />
              ))}
            </ul>
          </section>

          {/* Donors — owning school only */}
          {isOwner && (
            <section className="mt-10">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-ink">
                  Who&apos;s funded this
                </h2>
                <Link
                  href={`/dashboard/campaigns/${campaign.id}/report`}
                  className="text-sm font-semibold text-coral hover:text-coral-dark"
                >
                  Full report →
                </Link>
              </div>
              <CampaignDonors donations={donations} />
            </section>
          )}
        </div>

        {/* ---- Sticky funding summary ---- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
            <ProgressMeter
              raised={campaign.amount_raised}
              goal={campaign.funding_goal}
            />

            <dl className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
              <Row label="Goal" value={money(campaign.funding_goal)} />
              <Row
                label="Still needed"
                value={money(
                  Math.max(0, campaign.funding_goal - campaign.amount_raised),
                )}
              />
              <Row
                label="Closes"
                value={shortDate(campaign.deadline)}
              />
            </dl>

            <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-coral-dark">
              <Clock className="h-4 w-4" aria-hidden />
              {deadlineLabel(campaign.deadline)}
            </p>

            <p className="mt-5 text-xs leading-relaxed text-ink-faint">
              {funded
                ? "This campaign is fully funded — gear is on its way. Thank you!"
                : "Pick any item above to fund. You can cover a whole item or just a share of one."}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-surface-sunk/60 p-5 text-xs text-ink-soft">
            <p className="font-semibold text-ink">Where your money goes</p>
            <p className="mt-1 leading-relaxed">
              Every item is priced directly from the Hart Sport catalogue. Funds
              are released to order the gear once an item is covered.
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
