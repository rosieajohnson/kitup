"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Draft = { id: string; title: string | null };

export function SignOutButton({ isSchool = false }: { isSchool?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Draft campaigns the school has built but not yet posted (go-live).
  const [readyDrafts, setReadyDrafts] = useState<Draft[]>([]);
  const [confirming, setConfirming] = useState(false);

  // Find drafts that have at least one item — a campaign that's been built
  // but not posted. RLS limits these to the signed-in school's own campaigns.
  useEffect(() => {
    if (!isSchool || !isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("campaigns")
        .select("id, title, items(count)")
        .eq("status", "draft");
      if (cancelled || !data) return;
      const ready = data
        .filter(
          (c) =>
            (((c.items as { count: number }[] | null)?.[0]?.count ?? 0) as number) >
            0,
        )
        .map((c) => ({ id: c.id as string, title: (c.title as string) ?? null }));
      setReadyDrafts(ready);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSchool]);

  // Warn on tab close / refresh / external navigation while a draft is unposted.
  useEffect(() => {
    if (readyDrafts.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [readyDrafts.length]);

  const doSignOut = useCallback(async () => {
    setConfirming(false);
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  function onClick() {
    // If there's an unposted campaign, ask first.
    if (readyDrafts.length > 0) {
      setConfirming(true);
      return;
    }
    void doSignOut();
  }

  function goPost() {
    setConfirming(false);
    router.push(
      readyDrafts.length === 1
        ? `/dashboard/campaigns/${readyDrafts[0].id}/review`
        : "/dashboard",
    );
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onClick} disabled={loading}>
        {loading ? "Signing out…" : "Sign out"}
      </Button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="signout-confirm-title"
              className="font-display text-xl font-bold text-ink"
            >
              Post your campaign before you go?
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {readyDrafts.length === 1 ? (
                <>
                  Your campaign{" "}
                  <span className="font-semibold text-ink">
                    {readyDrafts[0].title || "(untitled)"}
                  </span>{" "}
                  is ready but hasn&apos;t been posted yet, so no one can see it
                  or fund it. Would you like to post it before leaving?
                </>
              ) : (
                <>
                  You have {readyDrafts.length} campaigns that are ready but
                  haven&apos;t been posted yet, so no one can see them or fund
                  them. Would you like to review them before leaving?
                </>
              )}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <Button size="sm" onClick={goPost} className="sm:flex-1">
                {readyDrafts.length === 1 ? "Review & post" : "Review campaigns"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={doSignOut}
                className="sm:flex-1"
              >
                Sign out anyway
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                className="sm:flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
