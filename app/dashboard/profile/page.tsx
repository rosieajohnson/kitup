import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { PROFILE_EDIT_READY, isUnlocked } from "@/lib/profile";
import { ProfileForm } from "@/components/profile-form";

export const metadata = { title: "Your profile" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ unlock?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/sign-in");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as "school" | "donor" | undefined;
  if (!role) redirect("/");

  const wrap = "container-page max-w-xl py-10 sm:py-14";

  if (!PROFILE_EDIT_READY) {
    return (
      <div className={wrap}>
        <h1 className="font-display text-2xl font-bold text-ink">Your profile</h1>
        <p className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
          Profile editing is being set up and will be available shortly.
        </p>
      </div>
    );
  }

  const { unlock } = await searchParams;

  const { data: prof2 } = await supabase
    .from("profiles")
    .select("edit_unlocked_until")
    .eq("id", user.id)
    .single();

  let initial: Record<string, string> = {};
  if (role === "school") {
    const { data } = await supabase
      .from("schools")
      .select("school, suburb, postcode, abn, contact_phone, address")
      .eq("id", user.id)
      .single();
    initial = {
      school: data?.school ?? "",
      suburb: data?.suburb ?? "",
      postcode: data?.postcode ?? "",
      abn: data?.abn ?? "",
      contact_phone: data?.contact_phone ?? "",
      address: data?.address ?? "",
    };
  } else {
    const { data } = await supabase
      .from("donors")
      .select("name, contact_phone")
      .eq("id", user.id)
      .single();
    initial = {
      name: data?.name ?? "",
      contact_phone: data?.contact_phone ?? "",
    };
  }

  return (
    <div className={wrap}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Your profile</h1>
        <Link
          href={role === "school" ? "/dashboard" : "/"}
          className="text-sm font-semibold text-coral hover:text-coral-dark"
        >
          Back
        </Link>
      </div>
      <ProfileForm
        role={role}
        email={user.email ?? ""}
        initial={initial}
        unlocked={isUnlocked(prof2?.edit_unlocked_until)}
        flash={unlock ?? null}
      />
    </div>
  );
}
