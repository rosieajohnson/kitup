import Link from "next/link";
import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignCard } from "@/components/campaign-card";
import { SchoolCampaignList } from "@/components/school-campaign-list";
import { CampaignDonors } from "@/components/campaign-donors";
import {
  getCampaigns,
  getCampaignsBySchool,
  getPlatformStats,
  getRecentDonations,
} from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { money } from "@/lib/format";
import type { CampaignSummary } from "@/lib/types";

export default async function HomePage() {
  const [campaigns, stats, viewer, recentDonations] = await Promise.all([
    getCampaigns(),
    getPlatformStats(),
    getViewer(),
    getRecentDonations(),
  ]);

  // School-only: the viewer's own campaigns, shown in "My Campaigns".
  let myCampaigns: CampaignSummary[] = [];
  if (viewer.role === "school" && viewer.userId) {
    myCampaigns = await getCampaignsBySchool(viewer.userId);
  }

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden">
        {/* faint court-line backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage:
              "radial-gradient(120% 90% at 50% 0%, black 30%, transparent 75%)",
          }}
        />
        <div className="container-page relative py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft">
              <ShieldCheck className="h-3.5 w-3.5 text-turf" aria-hidden />
              Schools verified · Gear priced from Hart Sport
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Back your local school&apos;s{" "}
              <span className="text-coral">next season.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              Schools list the exact sports gear they need. You fund it item by
              item — a set of basketballs, a netball post, a long-jump mat — and
              watch the lane fill up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#browse">
                <Button size="lg">
                  Browse campaigns <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              {viewer.role !== "donor" && (
                <Link href="/dashboard">
                  <Button size="lg" variant="outline">
                    Start a campaign
                  </Button>
                </Link>
              )}
            </div>

            {/* trust strip — small, not a hero centrepiece */}
            <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-4">
              <Stat label="raised so far" value={money(stats.raised)} />
              <Stat label="schools" value={String(stats.schools)} />
              <Stat
                label="campaigns live"
                value={String(stats.campaigns)}
              />
            </dl>
          </div>
        </div>
      </section>

      {/* ---- My Campaigns (signed-in school only) ---- */}
      {viewer.role === "school" && (
        <section className="container-page py-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
                My Campaigns
              </h2>
              <p className="mt-1 text-ink-soft">
                Your school&apos;s campaigns — drafts and live.
              </p>
            </div>
            <Link href="/dashboard/campaigns/new">
              <Button size="sm">
                <Plus className="h-4 w-4" aria-hidden /> New campaign
              </Button>
            </Link>
          </div>

          {myCampaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
              <h3 className="font-bold text-ink">No campaigns yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                Build your first campaign from the catalogue — donors can fund it
                the moment it&apos;s live.
              </p>
              <div className="mt-5">
                <Link href="/dashboard/campaigns/new">
                  <Button>
                    <Plus className="h-4 w-4" aria-hidden /> Create a campaign
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <SchoolCampaignList campaigns={myCampaigns} />
          )}
        </section>
      )}

      {/* ---- How it works ---- */}
      <section id="how" className="container-page scroll-mt-20 py-20">
        <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
          How Kit Up works
        </h2>
        <p className="mt-1 max-w-xl text-ink-soft">
          A straight line from a school&apos;s need to kit on the court.
        </p>

        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            n={1}
            title="A school lists what it needs"
            body="Verified schools build a campaign list of items it needs from the built-in catalogue — exact items, real prices, a clear goal and deadline."
          />
          <Step
            n={2}
            title="You fund the items"
            body="Browse campaigns near you and fund whole items or a share of them. Your donations are fully tax deductible and provided to Australian Sports Foundation who arrange Kit for your School Campaign. The lane fills as the community pitches in."
          />
          <Step
            n={3}
            title="The kit arrives"
            body="When an item is funded, it's ordered and shipped to the school. You see exactly what your money bought."
          />
          <Step
            n={4}
            title="Your generosity is rewarded"
            body="When it's time to do your tax return, include your receipt from your Kit Up donations and reduce your taxable income."
          />
        </ol>
      </section>

      {/* ---- Browse grid ---- */}
      <section id="browse" className="container-page scroll-mt-20 py-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              Campaigns that need you
            </h2>
            <p className="mt-1 text-ink-soft">
              Every dollar buys a real item from a real catalogue.
            </p>
          </div>
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-coral hover:text-coral-dark"
          >
            Save campaigns →
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      </section>

      {/* ---- Recent supporters (public) ---- */}
      {recentDonations.length > 0 && (
        <section className="container-page py-10">
          <div className="mb-6">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              Recent supporters
            </h2>
            <p className="mt-1 text-ink-soft">
              People backing local school sport, right now.
            </p>
          </div>
          <div className="max-w-xl">
            <CampaignDonors donations={recentDonations} />
          </div>
        </section>
      )}

    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-2xl font-bold text-ink">{value}</dd>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </p>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-coral-tint font-display text-sm font-bold text-coral-dark">
        {n}
      </span>
      <h3 className="mt-4 font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-soft">{body}</p>
    </li>
  );
}
