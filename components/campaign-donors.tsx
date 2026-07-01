"use client";

import { useEffect, useState } from "react";
import { HandHeart } from "lucide-react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Donation } from "@/lib/types";

/**
 * Shows a campaign's donors to the owning school. Cycles through the
 * donations one at a time, fading each in and out. Honors
 * prefers-reduced-motion by showing a plain static list instead.
 */
export function CampaignDonors({ donations }: { donations: Donation[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced || donations.length <= 1) return;
    const id = window.setInterval(() => {
      setVisible(false); // fade out
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % donations.length);
        setVisible(true); // fade the next one in
      }, 450);
    }, 4000);
    return () => window.clearInterval(id);
  }, [reduced, donations.length]);

  if (donations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-sm text-ink-soft">
        No donations yet — once donors fund items, they&apos;ll appear here.
      </p>
    );
  }

  // Reduced motion: show them all, no animation.
  if (reduced) {
    return (
      <ul className="space-y-2">
        {donations.map((d, i) => (
          <li
            key={i}
            className="rounded-xl border border-line bg-surface p-4 text-sm"
          >
            <DonationLine d={d} />
          </li>
        ))}
      </ul>
    );
  }

  const d = donations[index];
  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <div
        aria-live="polite"
        className={cn(
          "transition-opacity duration-500 ease-in-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <DonationLine d={d} />
      </div>
      {donations.length > 1 && (
        <p className="mt-4 text-xs text-ink-faint tabular-nums">
          {index + 1} of {donations.length} donations
        </p>
      )}
    </div>
  );
}

function DonationLine({ d }: { d: Donation }) {
  return (
    <p className="text-ink">
      <span className="inline-flex items-center gap-2">
        <HandHeart className="h-4 w-4 shrink-0 text-coral" aria-hidden />
        <span className="font-semibold">{d.donor_name}</span>
      </span>{" "}
      funded{" "}
      <span className="font-medium">
        {d.quantity}× {d.item_title}
      </span>{" "}
      — <span className="font-semibold tabular-nums">{money(d.amount)}</span>
    </p>
  );
}
