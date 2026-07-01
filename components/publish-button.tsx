"use client";

import { useState, useTransition } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publishCampaign } from "@/app/dashboard/campaigns/[id]/review/actions";

export function PublishButton({ campaignId }: { campaignId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function goLive() {
    setError(null);
    startTransition(async () => {
      const result = await publishCampaign(campaignId);
      // On success the action redirects; only errors return here.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
        />
        I&apos;ve checked the details above — name, description, deadline and
        items are correct.
      </label>

      <div className="mt-4">
        <Button
          size="lg"
          onClick={goLive}
          disabled={!confirmed || pending}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Rocket className="h-4 w-4" aria-hidden />
          )}
          {pending ? "Going live…" : "Go live"}
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
