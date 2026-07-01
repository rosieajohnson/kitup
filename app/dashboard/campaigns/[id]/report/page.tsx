import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCampaign, getCampaignReport } from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { money, moneyExact, shortDate } from "@/lib/format";
import { DownloadReportButton } from "@/components/download-report-button";

export const metadata = { title: "Donation report" };

type Params = { params: Promise<{ id: string }> };

export default async function CampaignReportPage({ params }: Params) {
  const { id } = await params;

  if (!isSupabaseConfigured()) redirect("/dashboard");
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/sign-in");

  const campaign = await getCampaign(id);
  const isOwner = Boolean(campaign && campaign.school.id === viewer.userId);
  // Owning school or ASF admin only.
  if (!isOwner && !viewer.isAdmin) notFound();

  const rows = await getCampaignReport(id);

  const title = campaign?.title ?? rows[0]?.campaign_title ?? "Campaign";
  const schoolName = campaign?.school.name ?? rows[0]?.school_name ?? "";
  const totalRaised = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const donorCount = new Set(rows.map((r) => r.donor_name)).size;

  return (
    <div className="container-page py-10 sm:py-14">
      <Link
        href={viewer.isAdmin && !isOwner ? "/admin" : "/dashboard"}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {viewer.isAdmin && !isOwner ? "Back to admin" : "Back to dashboard"}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-faint">Donation report</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            {title}
          </h1>
          {schoolName && (
            <p className="mt-1 text-sm text-ink-soft">{schoolName}</p>
          )}
        </div>
        <DownloadReportButton
          rows={rows}
          filename={`kitup-report-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`}
        />
      </div>

      {/* Totals */}
      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Total raised" value={money(totalRaised)} />
        <Stat label="Donations" value={String(rows.length)} />
        <Stat label="Donors" value={String(donorCount)} />
      </dl>

      {/* Table */}
      <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-surface">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-soft">
            No donations yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-semibold">Donor</th>
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-right font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">
                    {r.donor_name}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{r.item_title}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.quantity}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {moneyExact(Number(r.amount))}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-soft tabular-nums">
                    {shortDate(r.donated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </dt>
      <dd className="mt-1 font-display text-2xl font-bold text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}
