import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolCampaignList } from "@/components/school-campaign-list";
import { getCampaignsBySchool } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "School dashboard" };

export default async function DashboardPage() {
  // Mock/dev path (no Supabase): pin to one demo school so the UI runs.
  let schoolId = "s_brunswick";
  let schoolName = "Brunswick East Primary School";

  // Live path: require a signed-in school account.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");

    const { data: school } = await supabase
      .from("schools")
      .select("school")
      .eq("id", user.id)
      .single();
    // Signed in but not a school account (e.g. a donor) — send home.
    if (!school) redirect("/");

    schoolId = user.id;
    schoolName = school.school;
  }

  const campaigns = await getCampaignsBySchool(schoolId);

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-faint">School dashboard</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            {schoolName}
          </h1>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden /> New campaign
          </Button>
        </Link>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-lg font-bold text-ink">
          Your campaigns
        </h2>

        {campaigns.length === 0 ? (
          <EmptyState />
        ) : (
          <SchoolCampaignList campaigns={campaigns} />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
      <h3 className="font-bold text-ink">No campaigns yet</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
        Build your first campaign from the Hart Sport catalogue and set a goal.
        Donors can start funding the moment it&apos;s live.
      </p>
      <div className="mt-5">
        <Link href="/dashboard/campaigns/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden /> Create a campaign
          </Button>
        </Link>
      </div>
    </div>
  );
}
