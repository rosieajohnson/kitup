import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCatalogue } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CampaignForm } from "@/components/campaign-form";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  // Live path: only a signed-in school may create campaigns.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");

    const { data: school } = await supabase
      .from("schools")
      .select("id")
      .eq("id", user.id)
      .single();
    if (!school) redirect("/");
  }

  const catalogue = await getCatalogue();
  const mock = !isSupabaseConfigured();

  return (
    <div className="container-page py-10 sm:py-14">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
      </Link>

      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        New campaign
      </h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Build your campaign from the Hart Sport catalogue. Donors can fund each
        item the moment it&apos;s live.
      </p>

      <div className="max-w-3xl">
        <CampaignForm
          catalogue={catalogue}
          disabled={mock}
          notice={
            mock
              ? "You're on mock data — connect Supabase to actually save a campaign. The form is fully explorable."
              : undefined
          }
        />
      </div>
    </div>
  );
}
