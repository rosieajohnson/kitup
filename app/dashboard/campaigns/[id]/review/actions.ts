"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Publish a draft campaign ("go live"). Only the owning school may do
 * this (RLS enforces auth.uid() = school_id on the update). On success
 * it redirects to the now-public campaign page.
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

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "live" })
    .eq("id", campaignId)
    .eq("school_id", user.id)
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
