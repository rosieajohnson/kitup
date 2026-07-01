"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncRefunds } from "@/app/admin/actions";

export function SyncRefundsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      const result = await syncRefunds();
      if (result.error) {
        setMsg(result.error);
      } else {
        setMsg(
          `Synced — ${result.marked} purchase${result.marked === 1 ? "" : "s"} marked refunded.`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden />
        )}
        {pending ? "Syncing…" : "Sync refunds from Stripe"}
      </Button>
      {msg && <p className="mt-2 text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
