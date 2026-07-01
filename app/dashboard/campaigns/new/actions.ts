"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface NewItemInput {
  hart_product_id: string;
  title: string;
  cost: number;
  quantity_needed: number;
}

export interface CreateCampaignInput {
  title: string;
  description: string;
  deadline: string; // ISO date (yyyy-mm-dd) from the form
  cover_image: string | null;
  items: NewItemInput[];
}

/**
 * Create a campaign and its items as the signed-in school. RLS enforces
 * auth.uid() = school_id on campaigns and ownership on items, so this
 * only succeeds for a school account acting on its own campaign.
 *
 * Returns { error } on failure; on success it redirects to the new
 * campaign (so it never returns a value in that case).
 */
export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ error: string } | void> {
  if (!isSupabaseConfigured()) {
    return { error: "Creating campaigns needs Supabase connected." };
  }

  const title = input.title?.trim() ?? "";
  if (!title) return { error: "Give your campaign a title." };

  if (!input.deadline) return { error: "Pick a deadline." };
  const deadline = new Date(input.deadline);
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    return { error: "Deadline must be a future date." };
  }

  const items = (input.items ?? []).filter(
    (it) => it.hart_product_id && it.quantity_needed > 0 && it.cost >= 0,
  );
  if (items.length === 0) {
    return { error: "Add at least one item from the catalogue." };
  }

  const funding_goal = items.reduce(
    (sum, it) => sum + it.cost * it.quantity_needed,
    0,
  );
  if (funding_goal <= 0) {
    return { error: "Item costs add up to $0 — set a cost above zero." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in as a school." };

  const { data: school } = await supabase
    .from("schools")
    .select("id")
    .eq("id", user.id)
    .single();
  if (!school) return { error: "Only school accounts can create campaigns." };

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      title,
      description: input.description?.trim() || null,
      cover_image: input.cover_image || null,
      funding_goal,
      deadline: deadline.toISOString(),
      school_id: user.id,
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return { error: campaignError?.message ?? "Could not create the campaign." };
  }

  const { error: itemsError } = await supabase.from("items").insert(
    items.map((it) => ({
      campaign_id: campaign.id,
      hart_product_id: it.hart_product_id,
      title: it.title.trim() || "Untitled item",
      cost: it.cost,
      quantity_needed: it.quantity_needed,
    })),
  );

  if (itemsError) {
    // Don't leave an itemless shell campaign behind.
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    return { error: itemsError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  redirect(`/campaigns/${campaign.id}`);
}
