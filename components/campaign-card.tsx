import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  MapPin,
  Package,
  Clock,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressMeter } from "@/components/progress-meter";
import { deadlineLabel, daysLeft } from "@/lib/format";
import type { CampaignSummary } from "@/lib/types";

export function CampaignCard({ campaign }: { campaign: CampaignSummary }) {
  const funded = campaign.amount_raised >= campaign.funding_goal;
  const closing = daysLeft(campaign.deadline) >= 0 && daysLeft(campaign.deadline) <= 7;
  const location = [campaign.school.suburb, campaign.school.state]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift focus-visible:-translate-y-1"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunk">
        {campaign.cover_image && (
          <Image
            src={campaign.cover_image}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {funded ? (
            <Badge tone="sun">★ Fully kitted</Badge>
          ) : closing ? (
            <Badge tone="coral">Closing soon</Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-faint">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{location || "Australia"}</span>
          </span>
          {campaign.school.verified ? (
            <span
              className="inline-flex items-center gap-1 text-turf-dark"
              title="Verified against the ACARA schools list"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-ink-faint"
              title="Not yet verified"
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Unverified
            </span>
          )}
        </div>

        <h3 className="text-lg font-bold leading-snug text-ink">
          {campaign.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">
          {campaign.summary}
        </p>

        <div className="mt-auto pt-5">
          <ProgressMeter
            raised={campaign.amount_raised}
            goal={campaign.funding_goal}
          />

          <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-xs font-medium text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" aria-hidden />
              {campaign.item_count} items
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {deadlineLabel(campaign.deadline)}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-coral transition-transform group-hover:translate-x-0.5">
              Fund <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
