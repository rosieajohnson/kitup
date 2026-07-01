"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface EditItemInput {
  id?: string; // existing item id; absent = new item
  hart_product_id: string;
  title: string;
  cost: number;
  quantity_needed: number;
}

export interface UpdateCampaignInput {
  campaignId: string;
  title: string;
  description: string;
  deadline: string;
  cover_image: string | null;
  items: EditItemInput[];
}

/**
 * Edit a campaign the signed-in school owns. Campaign fields are
 * updated and items are reconciled by diff (update / insert / delete)
 * so existing funding is preserved. Guards: a funded item can't be
 * deleted, and its quantity can't be cut below what's already funded.
 */
export async function updateCampaign(
  input: UpdateCampaignInput,
): Promise<{ error?: string } | void> {
  if (!isSupabaseConfigured()) {
    return { error: "Editing needs Supabase connected." };
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
    return { error: "Keep at least one item on the campaign." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in as the owning school." };

  // Confirm ownership.
  const { data: owned } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", input.campaignId)
    .eq("school_id", user.id)
    .single();
  if (!owned) return { error: "You can only edit your own campaigns." };

  // Existing items + how much of each is already funded.
  const { data: existingRows } = await supabase
    .from("items")
    .select("id")
    .eq("campaign_id", input.campaignId);
  const existingIds = new Set((existingRows ?? []).map((r) => r.id as string));

  const { data: fundingRows } = await supabase
    .from("item_funding")
    .select("item_id, quantity_funded")
    .in("item_id", Array.from(existingIds));
  const fundedById = new Map<string, number>(
    (fundingRows ?? []).map((r) => [
      r.item_id as string,
      Number(r.quantity_funded),
    ]),
  );

  // Diff against the submission (ignore ids that aren't ours).
  const submittedIds = new Set(
    items.filter((it) => it.id && existingIds.has(it.id)).map((it) => it.id!),
  );
  const toUpdate = items.filter((it) => it.id && existingIds.has(it.id));
  const toInsert = items.filter((it) => !it.id);
  const toDeleteIds = Array.from(existingIds).filter(
    (id) => !submittedIds.has(id),
  );

  // Guard: can't delete a funded item.
  for (const id of toDeleteIds) {
    if ((fundedById.get(id) ?? 0) > 0) {
      return {
        error:
          "One of the items you removed already has funding — fully-funded or partially-funded items can't be deleted.",
      };
    }
  }
  // Guard: can't cut quantity below what's funded.
  for (const it of toUpdate) {
    const funded = fundedById.get(it.id!) ?? 0;
    if (it.quantity_needed < funded) {
      return {
        error: `"${it.title}" already has ${funded} funded — its quantity can't be lower than that.`,
      };
    }
  }

  const funding_goal = items.reduce(
    (sum, it) => sum + it.cost * it.quantity_needed,
    0,
  );
  if (funding_goal <= 0) {
    return { error: "Item costs add up to $0 — set a cost above zero." };
  }

  // Apply: campaign fields, then item updates / inserts / deletes.
  const { error: campaignError } = await supabase
    .from("campaigns")
    .update({
      title,
      description: input.description?.trim() || null,
      cover_image: input.cover_image || null,
      funding_goal,
      deadline: deadline.toISOString(),
    })
    .eq("id", input.campaignId);
  if (campaignError) return { error: campaignError.message };

  for (const it of toUpdate) {
    const { error } = await supabase
      .from("items")
      .update({
        title: it.title.trim() || "Untitled item",
        cost: it.cost,
        quantity_needed: it.quantity_needed,
        hart_product_id: it.hart_product_id,
      })
      .eq("id", it.id!)
      .eq("campaign_id", input.campaignId);
    if (error) return { error: error.message };
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("items").insert(
      toInsert.map((it) => ({
        campaign_id: input.campaignId,
        hart_product_id: it.hart_product_id,
        title: it.title.trim() || "Untitled item",
        cost: it.cost,
        quantity_needed: it.quantity_needed,
      })),
    );
    if (error) return { error: error.message };
  }

  if (toDeleteIds.length > 0) {
    const { error } = await supabase
      .from("items")
      .delete()
      .in("id", toDeleteIds)
      .eq("campaign_id", input.campaignId);
    if (error) return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/campaigns/${input.campaignId}`);
  redirect(`/campaigns/${input.campaignId}`);
}

/**
 * Delete a campaign the signed-in school owns. Blocked once the
 * campaign has any funding, since deletion cascades to its purchases
 * and would destroy donor records. On success, redirects to the
 * dashboard.
 */
export async function deleteCampaign(
  campaignId: string,
): Promise<{ error?: string } | void> {
  if (!isSupabaseConfigured()) {
    return { error: "Deleting needs Supabase connected." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in as the owning school." };

  const { data: owned } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("school_id", user.id)
    .single();
  if (!owned) return { error: "You can only delete your own campaigns." };

  // Guard: don't delete a campaign that has funding (cascade would wipe
  // the donors' purchase records). Unfunded campaigns have no row here.
  const { data: funding } = await supabase
    .from("campaign_funding")
    .select("amount_raised")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (funding && Number(funding.amount_raised) > 0) {
    return {
      error:
        "This campaign already has funding, so it can't be deleted — donor records must be kept.",
    };
  }

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("school_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
