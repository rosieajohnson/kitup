"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { resolveActiveSchool, canPublish } from "@/lib/team";

/**
 * Publish a draft campaign ("go live"). Only owners and editors may do this
 * (contributors can build but not publish) — enforced here AND by the DB
 * trigger on campaigns.status. On success it redirects to the public page.
 */
export async function publishCampaign(
  campaignId: string,
): Promise<{ error?: string } | void> {
  if (!isSupabaseConfigured()) {
    return { error: "Publishing needs Supabase connected." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in as the owning school." };

  const active = await resolveActiveSchool(supabase, user.id);
  if (!active) return { error: "You can only publish your own school's campaigns." };
  if (!canPublish(active.role)) {
    return {
      error:
        "Contributors can build campaigns but can't publish them — ask an editor or owner to post it.",
    };
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "live" })
    .eq("id", campaignId)
    .eq("school_id", active.schoolId)
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: error?.message ?? "Could not publish — are you the owner?",
    };
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}
