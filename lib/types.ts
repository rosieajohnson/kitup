/**
 * Types mirroring the approved Supabase schema (supabase/migrations/0001_init.sql).
 * Keep these in sync with the SQL. When you wire up live data you can replace
 * these hand-written types with generated ones:
 *   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts
 */

export type UserRole = "school" | "donor";

/** A campaign is a private draft until the school publishes it. */
export type CampaignStatus = "draft" | "live";

/** public.profiles — the "users" umbrella, 1:1 with auth.users. */
export interface Profile {
  id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/** public.schools */
export interface School {
  id: string;
  role: "school";
  school: string;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  contact_email: string;
  department: string | null;
  address_verified: boolean;
  created_at: string;
  updated_at: string;
}

/** public.donors */
export interface Donor {
  id: string;
  role: "donor";
  name: string;
  address: string | null;
  contact_email: string;
  created_at: string;
  updated_at: string;
}

/** public.campaigns — created and edited by schools only. */
export interface Campaign {
  id: string;
  title: string;
  description: string | null;
  funding_goal: number;
  deadline: string;
  school_id: string;
  created_at: string;
  updated_at: string;
}

/** public.hart_sport_products — local mirror of the Hart Sport catalogue. */
export interface HartSportProduct {
  id: string;
  hart_sku: string;
  name: string;
  category: string | null;
  unit_price: number | null;
  product_url: string | null;
  synced_at: string;
}

/** public.items — what a campaign needs; each maps to a Hart product. */
export interface Item {
  id: string;
  campaign_id: string;
  hart_product_id: string;
  title: string;
  description: string | null;
  cost: number;
  quantity_needed: number;
  created_at: string;
}

/** public.purchases — one row per item a donor funds. Immutable. */
export interface Purchase {
  id: string;
  donor_id: string;
  item_id: string;
  campaign_id: string;
  quantity: number;
  amount: number;
  created_at: string;
}

/* ------------------------------------------------------------
   View models — shapes the UI actually renders. These join the
   raw rows above with computed funding figures.
   ------------------------------------------------------------ */

/** An item plus how much of it has already been funded. */
export interface ItemWithFunding extends Item {
  product: HartSportProduct | null;
  quantity_funded: number;
  amount_raised: number;
  category: string | null;
}

/** A campaign card: enough to render a listing without items. */
export interface CampaignSummary {
  id: string;
  title: string;
  summary: string;
  status: CampaignStatus;
  funding_goal: number;
  amount_raised: number;
  deadline: string;
  item_count: number;
  cover_image: string | null;
  school: {
    id: string;
    name: string;
    suburb: string | null;
    state: string | null;
    verified: boolean;
  };
}

/** A campaign detail page: summary plus its funding line items. */
export interface CampaignDetail extends CampaignSummary {
  description: string;
  items: ItemWithFunding[];
}

/** One donation, as shown to the owning school (no donor contact details). */
export interface Donation {
  donor_name: string;
  item_title: string;
  quantity: number;
  amount: number;
  created_at: string;
}

/** A row in a campaign donation report (school or ASF admin). */
export interface ReportRow {
  campaign_title: string;
  school_name: string;
  donor_name: string;
  item_title: string;
  quantity: number;
  amount: number;
  donated_at: string;
}

/** A campaign as listed in the ASF admin console. */
export interface AdminCampaign {
  campaign_id: string;
  campaign_title: string;
  school_name: string;
  status: CampaignStatus;
  funding_goal: number;
  amount_raised: number;
  donation_count: number;
  deadline: string;
}
