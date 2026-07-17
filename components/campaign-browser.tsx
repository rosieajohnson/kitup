"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { CampaignCard } from "@/components/campaign-card";
import type { CampaignSummary } from "@/lib/types";

/**
 * Client-side search over the (already-loaded) active campaigns. Matches
 * the school name primarily, plus suburb/state and the campaign title, so
 * donors can find a school's live campaigns quickly.
 */
export function CampaignBrowser({
  campaigns,
}: {
  campaigns: CampaignSummary[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return campaigns;
    return campaigns.filter((c) => {
      const haystack = [
        c.school.name,
        c.school.suburb ?? "",
        c.school.state ?? "",
        c.title,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [campaigns, q]);

  return (
    <div>
      <div className="relative mb-8 max-w-md">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by school name…"
          aria-label="Search active campaigns by school"
          className="w-full rounded-full border border-line-strong bg-surface py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {q && (
        <p className="mb-4 text-sm text-ink-soft">
          {filtered.length} campaign{filtered.length === 1 ? "" : "s"} matching
          &quot;{query.trim()}&quot;
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="font-bold text-ink">No campaigns found</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            No active campaigns match that school. Try a different name or clear
            the search.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
