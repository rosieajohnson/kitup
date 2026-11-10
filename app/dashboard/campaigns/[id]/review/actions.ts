"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { resolveActiveSchool, canPublish } from "@/lib/team";
import { notifyAdminCampaignLive } from "@/lib/notify";
import { DELIVERY_CONFIRM_READY } from "@/lib/profile";

/**
 * Publish a draft campaign ("go live"). Only owners and editors may do this
 * (contributors can create/edit but not publish) — enforced here AND by the DB
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
        "Contributors can create and edit campaigns but can't publish them — ask an editor or owner to post it.",
    };
  }

  // Delivery address must be confirmed before a campaign can go live, so gear
  // always has a verified place to ship to.
  const { data: school } = await supabase
    .from("schools")
    .select("school, address, delivery_confirmed")
    .eq("id", active.schoolId)
    .single();
  if (
    DELIVERY_CONFIRM_READY &&
    (!school?.delivery_confirmed || !school.address?.trim())
  ) {
    return {
      error:
        "Confirm your school's delivery address before going live. Open your profile, check the delivery address (add a street number if it's missing) and save — that confirms it.",
    };
  }

  // Only email the admin on a genuine draft -> live transition (not a re-publish).
  const { data: before } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", campaignId)
    .eq("school_id", active.schoolId)
    .single();
  const wasLive = before?.status === "live";

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "live" })
    .eq("id", campaignId)
    .eq("school_id", active.schoolId)
    .select("id, title, deadline")
    .single();

  if (error || !data) {
    return {
      error: error?.message ?? "Could not publish — are you the owner?",
    };
  }

  // Best-effort: email the admin the full item list now the campaign is live.
  // Never let a notification failure block publishing.
  if (!wasLive) {
    try {
      const { data: items } = await supabase
        .from("items")
        .select("title, quantity_needed, cost, product:hart_sport_products ( hart_sku )")
        .eq("campaign_id", campaignId);
      if (items?.length) {
        const lines = items.map((it) => {
          const p = Array.isArray(it.product) ? it.product[0] : it.product;
          const quantity = it.quantity_needed ?? 0;
          const unitPrice = Number(it.cost) || 0;
          return {
            sku: (p as { hart_sku?: string } | null)?.hart_sku ?? null,
            title: it.title,
            quantity,
            unitPrice,
            lineTotal: unitPrice * quantity,
          };
        });
        await notifyAdminCampaignLive({
          campaignId,
          campaignTitle: data.title,
          schoolName: school?.school ?? "(unknown school)",
          deadlineISO: data.deadline,
          lines,
          total: lines.reduce((s, l) => s + l.lineTotal, 0),
        });
      }
    } catch (e) {
      console.error("notifyAdminCampaignLive failed", e);
    }
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}
