import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminCampaigns, getAllDonationsReport } from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { money, shortDate } from "@/lib/format";
import { DownloadReportButton } from "@/components/download-report-button";
import { SyncRefundsButton } from "@/components/sync-refunds-button";
import { archiveCampaign, restoreCampaign } from "./actions";

export const metadata = { title: "ASF admin" };

export default async function AdminPage() {
  if (!isSupabaseConfigured()) redirect("/");
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/sign-in");
  if (!viewer.isAdmin) notFound();

  const [campaigns, allDonations] = await Promise.all([
    getAdminCampaigns(),
    getAllDonationsReport(),
  ]);

  const totalRaised = allDonations.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-faint">
            Australian Sports Foundation
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            Admin — all campaigns
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {campaigns.length} campaigns · {money(totalRaised)} raised across{" "}
            {allDonations.length} donations
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SyncRefundsButton />
            <DownloadReportButton
              rows={allDonations}
              filename="kitup-all-donations.csv"
            />
            <a href="/api/admin/donor-export" download>
              <Button size="sm" variant="outline">
                <Download className="h-4 w-4" aria-hidden /> Donor CSV
              </Button>
            </a>
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-surface">
        {campaigns.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-soft">
            No campaigns yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-semibold">Campaign</th>
                <th className="px-4 py-3 font-semibold">School</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Raised</th>
                <th className="px-4 py-3 text-right font-semibold">Donations</th>
                <th className="px-4 py-3 text-right font-semibold">Closes</th>
                <th className="px-4 py-3 text-right font-semibold">Report</th>
                <th className="px-4 py-3 text-right font-semibold">Manage</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.campaign_id}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-ink">
                    {c.campaign_title}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{c.school_name}</td>
                  <td className="px-4 py-3">
                    {c.status === "draft" ? (
                      <Badge tone="neutral">Draft</Badge>
                    ) : c.status === "archived" ? (
                      <Badge tone="neutral">Archived</Badge>
                    ) : (
                      <Badge tone="turf">Live</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money(Number(c.amount_raised))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.donation_count}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-soft tabular-nums">
                    {shortDate(c.deadline)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/campaigns/${c.campaign_id}/report`}
                      className="inline-flex items-center gap-1 font-semibold text-coral hover:text-coral-dark"
                    >
                      View <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "archived" ? (
                      <form action={restoreCampaign}>
                        <input
                          type="hidden"
                          name="campaign_id"
                          value={c.campaign_id}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          className="border-turf/50 text-turf-dark hover:border-turf hover:bg-turf/10"
                        >
                          Restore
                        </Button>
                      </form>
                    ) : (
                      <form action={archiveCampaign}>
                        <input
                          type="hidden"
                          name="campaign_id"
                          value={c.campaign_id}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          className="border-coral/50 text-coral-dark hover:border-coral hover:bg-coral/10"
                        >
                          Archive
                        </Button>
                      </form>
                    )}
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
