"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDeliveryAddress } from "@/app/dashboard/campaigns/[id]/review/actions";

/**
 * Lets a school either confirm its delivery address as-is (one click) or go to
 * the profile to edit it. Shown on the review page when the address isn't yet
 * confirmed. With no address on file, only Edit (add one) is offered.
 */
export function DeliveryConfirm({
  campaignId,
  hasAddress,
}: {
  campaignId: string;
  hasAddress: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmDeliveryAddress(campaignId);
      if ("error" in result && result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        {hasAddress && (
          <Button onClick={confirm} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            {pending ? "Confirming…" : "Confirm address"}
          </Button>
        )}
        <Link
          href="/dashboard/profile"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunk"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          {hasAddress ? "Edit address" : "Add a delivery address"}
        </Link>
      </div>
      {hasAddress && (
        <p className="mt-2 text-xs text-ink-faint">
          Confirm accepts the address above as-is. Edit lets you change it.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-coral-dark">
          {error}
        </p>
      )}
    </div>
  );
}
