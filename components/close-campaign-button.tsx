"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeCampaign } from "@/app/dashboard/campaigns/[id]/review/actions";

/**
 * Owner/editor control to close a live campaign early. Two-step (click, then
 * confirm) because closing reconciles — it orders funded items, turns the
 * shortfall into a gift card, emails the ledger, and stops donations.
 */
export function CloseCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function doClose() {
    setError(null);
    startTransition(async () => {
      const result = await closeCampaign(campaignId);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <XCircle className="h-4 w-4" aria-hidden /> Close campaign early
      </Button>
    );
  }

  return (
    <div className="max-w-md rounded-lg border border-coral/30 bg-coral/5 p-3">
      <p className="text-sm font-medium text-ink">Close this campaign now?</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        This orders the funded items, turns any shortfall into a Hart Sport gift
        card for the school, emails the summary, and stops further donations. It
        can&apos;t be undone.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={doClose} disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {pending ? "Closing…" : "Yes, close now"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-coral-dark">
          {error}
        </p>
      )}
    </div>
  );
}
