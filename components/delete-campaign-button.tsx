"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteCampaign } from "@/app/dashboard/campaigns/[id]/edit/actions";

export function DeleteCampaignButton({ campaignId }: { campaignId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function doDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCampaign(campaignId);
      // On success the action redirects; only errors return here.
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink">
            Permanently delete this campaign and its items?
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={doDelete}
              disabled={pending}
              className="bg-coral text-white hover:bg-coral-dark"
            >
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {pending ? "Deleting…" : "Yes, delete"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
          className="border-coral/40 text-coral-dark hover:bg-coral/5"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete campaign
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-coral-dark">
          {error}
        </p>
      )}
    </div>
  );
}
