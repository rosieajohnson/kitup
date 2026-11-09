import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { TEAM_ACCESS_READY } from "@/lib/team";
import { TeamManager } from "@/components/team-manager";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  if (!isSupabaseConfigured() || !TEAM_ACCESS_READY) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/sign-in");
  // Owner-only — members can't manage the team.
  if (!viewer.schoolId || viewer.schoolRole !== "owner") notFound();

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("school_members")
    .select("user_id, role, created_at")
    .eq("school_id", viewer.schoolId)
    .order("created_at", { ascending: true });

  const members: { userId: string; email: string; role: string }[] = [];
  for (const r of rows ?? []) {
    let email = "(unknown)";
    try {
      const { data } = await admin.auth.admin.getUserById(r.user_id as string);
      email = data.user?.email ?? email;
    } catch {
      /* best-effort */
    }
    members.push({ userId: r.user_id as string, email, role: r.role as string });
  }

  return (
    <div className="container-page py-10 sm:py-14">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
      </Link>

      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Team
      </h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Invite colleagues to help manage {viewer.name ?? "your school"}.{" "}
        <strong>Editors</strong> can create / edit campaigns and publish/close
        them; <strong>contributors</strong> can create / edit campaigns but not
        publish or close them. Only you (the owner) can manage the team and the
        school profile.
      </p>

      <div className="mt-8 max-w-2xl">
        <TeamManager members={members} />
      </div>
    </div>
  );
}
