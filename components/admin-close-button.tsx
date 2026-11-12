"use client";

import { Button } from "@/components/ui/button";
import { closeCampaign } from "@/app/admin/actions";

/**
 * ASF-admin "Close" button for a live campaign. Submits the closeCampaign
 * server action (reconcile + archive) behind a confirm, since it triggers
 * real fulfilment + emails.
 */
export function AdminCloseButton({ campaignId }: { campaignId: string }) {
  return (
    <form
      action={closeCampaign}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Close this campaign now? This orders the funded items, rolls any shortfall into a gift card, emails the ledger, and stops donations. It can't be undone.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="border-coral/50 text-coral-dark hover:border-coral hover:bg-coral/10"
      >
        Close
      </Button>
    </form>
  );
}
