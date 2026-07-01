import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressMeter } from "@/components/progress-meter";
import { deadlineLabel, money } from "@/lib/format";
import type { CampaignSummary } from "@/lib/types";

/** The signed-in school's own campaigns, with status + manage actions. */
export function SchoolCampaignList({
  campaigns,
}: {
  campaigns: CampaignSummary[];
}) {
  return (
    <ul className="space-y-4">
      {campaigns.map((c) => {
        const funded = c.amount_raised >= c.funding_goal;
        return (
          <li
            key={c.id}
            className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2">
                  {c.status === "draft" ? (
                    <Badge tone="neutral">Draft</Badge>
                  ) : funded ? (
                    <Badge tone="turf">Fully funded</Badge>
                  ) : (
                    <Badge tone="coral">Active</Badge>
                  )}
                  <span className="text-xs text-ink-faint">
                    {deadlineLabel(c.deadline)}
                  </span>
                </div>
                <h3 className="font-bold text-ink">{c.title}</h3>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {money(c.amount_raised)} raised · {c.item_count} items
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/dashboard/campaigns/${c.id}/edit`}>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </Link>
                {c.status === "draft" ? (
                  <Link href={`/dashboard/campaigns/${c.id}/review`}>
                    <Button size="sm">Review &amp; go live</Button>
                  </Link>
                ) : (
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-coral hover:text-coral-dark"
                  >
                    View <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-4 max-w-md">
              <ProgressMeter
                raised={c.amount_raised}
                goal={c.funding_goal}
                showCaption={false}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
