import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCampaign, getCatalogue } from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CampaignForm, type CampaignFormInitial } from "@/components/campaign-form";
import { DeleteCampaignButton } from "@/components/delete-campaign-button";

export const metadata = { title: "Edit campaign" };

type Params = { params: Promise<{ id: string }> };

export default async function EditCampaignPage({ params }: Params) {
  const { id } = await params;

  if (!isSupabaseConfigured()) redirect("/dashboard");

  const viewer = await getViewer();
  if (!viewer.userId) redirect("/sign-in");

  const campaign = await getCampaign(id);
  // Owner-only (RLS lets the owner read its own draft/live campaign).
  if (!campaign || campaign.school.id !== viewer.userId) notFound();

  const catalogue = await getCatalogue();

  const initial: CampaignFormInitial = {
    campaignId: campaign.id,
    title: campaign.title,
    description: campaign.description,
    deadline: campaign.deadline.slice(0, 10),
    coverImage: campaign.cover_image,
    items: campaign.items.map((it) => ({
      id: it.id,
      hart_product_id: it.hart_product_id,
      productName: it.product?.name ?? it.title,
      title: it.title,
      cost: it.cost,
      quantity_needed: it.quantity_needed,
      quantity_funded: it.quantity_funded,
    })),
  };

  return (
    <div className="container-page py-10 sm:py-14">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
      </Link>

      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Edit campaign
      </h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Update the details or items below.
        {campaign.status === "live"
          ? " This campaign is live, so changes are visible to donors immediately. Funded items can't be removed."
          : " It's still a draft, so nothing's public yet."}
      </p>

      <div className="max-w-3xl">
        <CampaignForm catalogue={catalogue} initial={initial} />

        <div className="mt-10 rounded-xl border border-coral/30 bg-coral/5 p-6">
          <h2 className="font-display text-lg font-bold text-ink">
            Delete campaign
          </h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">
            Permanently removes this campaign and its items. This can&apos;t be
            undone. A campaign that already has funding can&apos;t be deleted.
          </p>
          <DeleteCampaignButton campaignId={campaign.id} />
        </div>
      </div>
    </div>
  );
}
