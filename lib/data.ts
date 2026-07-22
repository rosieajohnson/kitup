import type {
  AdminCampaign,
  CampaignDetail,
  CampaignStatus,
  CampaignSummary,
  Donation,
  HartSportProduct,
  ItemWithFunding,
  ReportRow,
} from "@/lib/types";
import { MOCK_CAMPAIGNS, MOCK_SUMMARIES } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Data-access layer (HYBRID). The whole app reads campaigns through
 * these functions — this is the ONLY file to change when you go live.
 *
 * Behaviour depends on whether Supabase is configured:
 *   - No env vars set  -> returns mock data from lib/mock-data.ts, so
 *     the UI runs with no backend (the default `npm run dev` path).
 *   - Supabase configured -> runs the live queries below. Funding
 *     totals come from the public aggregate views (migration 0003) so
 *     anonymous visitors see real numbers without the private
 *     purchases table being exposed.
 *
 * Two notes about the schema as written:
 *   - There is no cover_image column on campaigns, so cover_image is
 *     null on the live path. Add one (e.g. `alter table campaigns add
 *     column cover_image text`) or store images in Supabase Storage,
 *     then map it below. The UI already handles a null image.
 *   - There is no `state` column on schools, so school.state is null.
 *     Add one, or join school_registry, if you need it.
 */

/* ---- raw row shapes returned by the live queries ---- */

interface SchoolRow {
  id: string;
  school: string;
  suburb: string | null;
  address_verified: boolean;
  abn_verified: boolean;
}

interface ProductRow {
  id: string;
  hart_sku: string;
  name: string;
  category: string | null;
  unit_price: number | null;
  product_url: string | null;
  image_url: string | null;
  synced_at: string;
}

interface ItemRow {
  id: string;
  campaign_id: string;
  hart_product_id: string;
  title: string;
  description: string | null;
  cost: number;
  quantity_needed: number;
  created_at: string;
  product: ProductRow | ProductRow[] | null;
}

interface CampaignRow {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  cover_image: string | null;
  funding_goal: number;
  deadline: string;
  school: SchoolRow | SchoolRow[] | null;
  items: { id: string }[] | null;
}

interface CampaignDetailRow extends Omit<CampaignRow, "items"> {
  items: ItemRow[] | null;
}

/** PostgREST returns to-one embeds as objects, but normalise defensively. */
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// `abn_verified` is added by migration 0019. Selecting a column that doesn't
// exist yet makes the whole campaigns query fail (42703), so we gate it behind
// this flag. It also self-heals: if the column is requested but missing, the
// query is retried once without it.
//
// >>> After applying migration 0019, set ABN_COLUMN_READY = true to light up
//     the ABN-verified badge from live data. <<<
const ABN_COLUMN_READY = true;
let hasAbnColumn = ABN_COLUMN_READY;
function schoolEmbed(): string {
  return `school:schools ( id, school, suburb, address_verified${
    hasAbnColumn ? ", abn_verified" : ""
  } )`;
}

// hart_sport_products.image_url ships in migration 0025.
// >>> After applying migration 0025, set IMAGE_COLUMN_READY = true to show
//     product photos on campaigns from live data. <<<
const IMAGE_COLUMN_READY = true;
const PRODUCT_FIELDS = `id, hart_sku, name, category, unit_price, product_url${
  IMAGE_COLUMN_READY ? ", image_url" : ""
}, synced_at`;
async function withAbnFallback<
  T extends { error: { code?: string } | null },
>(run: () => PromiseLike<T>): Promise<T> {
  const res = await run();
  if (res.error?.code === "42703" && hasAbnColumn) {
    hasAbnColumn = false;
    return run();
  }
  return res;
}

function toSummary(row: CampaignRow, amountRaised: number): CampaignSummary {
  const school = one(row.school);
  return {
    id: row.id,
    title: row.title,
    summary: row.description ?? "",
    status: row.status,
    funding_goal: Number(row.funding_goal),
    amount_raised: amountRaised,
    deadline: row.deadline,
    item_count: row.items?.length ?? 0,
    cover_image: row.cover_image,
    school: {
      id: school?.id ?? "",
      name: school?.school ?? "Unknown school",
      suburb: school?.suburb ?? null,
      state: null, // see note above
      verified: school?.address_verified ?? false,
      abnVerified: school?.abn_verified ?? false,
    },
  };
}

/* ---- queries ---- */

export async function getCampaigns(): Promise<CampaignSummary[]> {
  if (!isSupabaseConfigured()) return MOCK_SUMMARIES;

  const supabase = await createClient();

  const { data, error } = await withAbnFallback(() =>
    supabase
      .from("campaigns")
      .select(
        `id, title, description, status, cover_image, funding_goal, deadline,
         ${schoolEmbed()},
         items ( id )`,
      )
      .eq("status", "live")
      // Hide closed campaigns from the public browse — matches the funding gate
      // (a campaign stops taking money once its deadline passes).
      .gte("deadline", new Date().toISOString())
      .order("deadline", { ascending: true }),
  );

  if (error || !data) {
    console.error("getCampaigns failed:", error?.message);
    return [];
  }

  const rows = data as unknown as CampaignRow[];
  const raised = await fundingByCampaign(
    supabase,
    rows.map((r) => r.id),
  );

  return rows.map((row) => toSummary(row, raised.get(row.id) ?? 0));
}

export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_CAMPAIGNS.find((c) => c.id === id) ?? null;
  }

  const supabase = await createClient();

  const { data, error } = await withAbnFallback(() =>
    supabase
      .from("campaigns")
      .select(
        `id, title, description, status, cover_image, funding_goal, deadline,
         ${schoolEmbed()},
         items (
           id, campaign_id, hart_product_id, title, description,
           cost, quantity_needed, created_at,
           product:hart_sport_products ( ${PRODUCT_FIELDS} )
         )`,
      )
      .eq("id", id)
      .single(),
  );

  if (error || !data) {
    console.error("getCampaign failed:", error?.message);
    return null;
  }

  const row = data as unknown as CampaignDetailRow;
  const items = row.items ?? [];

  // One query for this campaign's per-item funding totals.
  const itemFunding = await fundingByItem(
    supabase,
    items.map((i) => i.id),
  );
  const campaignRaised = await fundingByCampaign(supabase, [row.id]);

  const fundedItems: ItemWithFunding[] = items.map((item) => {
    const product = one(item.product);
    const f = itemFunding.get(item.id) ?? { quantity: 0, amount: 0 };
    return {
      id: item.id,
      campaign_id: item.campaign_id,
      hart_product_id: item.hart_product_id,
      title: item.title,
      description: item.description,
      cost: Number(item.cost),
      quantity_needed: item.quantity_needed,
      created_at: item.created_at,
      product,
      quantity_funded: f.quantity,
      amount_raised: f.amount,
      category: product?.category ?? null,
    };
  });

  const summary = toSummary(
    { ...row, items: items.map((i) => ({ id: i.id })) },
    campaignRaised.get(row.id) ?? 0,
  );

  return {
    ...summary,
    description: row.description ?? "",
    items: fundedItems,
  };
}

export async function getCampaignsBySchool(
  schoolId: string,
): Promise<CampaignSummary[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SUMMARIES.filter((c) => c.school.id === schoolId);
  }

  const supabase = await createClient();

  const { data, error } = await withAbnFallback(() =>
    supabase
      .from("campaigns")
      .select(
        `id, title, description, status, cover_image, funding_goal, deadline,
         ${schoolEmbed()},
         items ( id )`,
      )
      .eq("school_id", schoolId)
      .order("deadline", { ascending: true }),
  );

  if (error || !data) {
    console.error("getCampaignsBySchool failed:", error?.message);
    return [];
  }

  const rows = data as unknown as CampaignRow[];
  const raised = await fundingByCampaign(
    supabase,
    rows.map((r) => r.id),
  );
  return rows.map((row) => toSummary(row, raised.get(row.id) ?? 0));
}

/** The Hart Sport catalogue — products a school picks items from. */
const MOCK_CATALOGUE: HartSportProduct[] = Array.from(
  new Map(
    MOCK_CAMPAIGNS.flatMap((c) => c.items)
      .map((it) => it.product)
      .filter((p): p is HartSportProduct => p !== null)
      .map((p) => [p.id, p]),
  ).values(),
);

export async function getCatalogue(): Promise<HartSportProduct[]> {
  if (!isSupabaseConfigured()) return MOCK_CATALOGUE;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hart_sport_products")
    .select(PRODUCT_FIELDS)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("getCatalogue failed:", error?.message);
    return [];
  }
  return data as unknown as HartSportProduct[];
}

/**
 * Donations to a campaign, for the owning school's eyes only. Backed by
 * the campaign_donations() function (migration 0010), which returns rows
 * only when the caller owns the campaign and exposes just the donor name
 * — never contact details.
 */
export async function getCampaignDonations(
  campaignId: string,
): Promise<Donation[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campaign_donations", {
    p_campaign_id: campaignId,
  });
  if (error || !data) {
    console.error("getCampaignDonations failed:", error?.message);
    return [];
  }
  return data as Donation[];
}

/**
 * Recent donations across all LIVE campaigns, for the public supporters
 * feed on the homepage. Reads the public_donations view (migration 0011),
 * which exposes donor name + item + amount (never contact details).
 */
export async function getRecentDonations(limit = 12): Promise<Donation[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_donations")
    .select("donor_name, item_title, quantity, amount, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    console.error("getRecentDonations failed:", error?.message);
    return [];
  }
  return data as Donation[];
}

/**
 * One campaign's donation report — for the owning school OR an ASF
 * admin. Backed by campaign_report() (migration 0012), which gates
 * access and exposes donor name + item + amount only.
 */
export async function getCampaignReport(
  campaignId: string,
): Promise<ReportRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campaign_report", {
    p_campaign_id: campaignId,
  });
  if (error || !data) {
    console.error("getCampaignReport failed:", error?.message);
    return [];
  }
  return data as ReportRow[];
}

/** Every donation across every campaign — ASF admin only. */
export async function getAllDonationsReport(): Promise<ReportRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("all_donations_report");
  if (error || !data) {
    console.error("getAllDonationsReport failed:", error?.message);
    return [];
  }
  return data as ReportRow[];
}

/** All campaigns with totals — ASF admin console. */
export async function getAdminCampaigns(): Promise<AdminCampaign[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_campaign_list");
  if (error || !data) {
    console.error("getAdminCampaigns failed:", error?.message);
    return [];
  }
  return data as AdminCampaign[];
}

/** Headline totals for the homepage trust strip. */
export async function getPlatformStats() {
  const campaigns = await getCampaigns();
  const raised = campaigns.reduce((sum, c) => sum + c.amount_raised, 0);
  const fullyFunded = campaigns.filter(
    (c) => c.amount_raised >= c.funding_goal,
  ).length;
  return {
    schools: new Set(campaigns.map((c) => c.school.id)).size,
    raised,
    campaigns: campaigns.length,
    fullyFunded,
  };
}

/* ---- funding lookups (read the public aggregate views) ---- */

type Client = Awaited<ReturnType<typeof createClient>>;

async function fundingByCampaign(
  supabase: Client,
  campaignIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (campaignIds.length === 0) return map;

  const { data, error } = await supabase
    .from("campaign_funding")
    .select("campaign_id, amount_raised")
    .in("campaign_id", campaignIds);

  if (error || !data) {
    console.error("campaign_funding failed:", error?.message);
    return map;
  }
  for (const row of data as { campaign_id: string; amount_raised: number }[]) {
    map.set(row.campaign_id, Number(row.amount_raised));
  }
  return map;
}

async function fundingByItem(
  supabase: Client,
  itemIds: string[],
): Promise<Map<string, { quantity: number; amount: number }>> {
  const map = new Map<string, { quantity: number; amount: number }>();
  if (itemIds.length === 0) return map;

  const { data, error } = await supabase
    .from("item_funding")
    .select("item_id, quantity_funded, amount_raised")
    .in("item_id", itemIds);

  if (error || !data) {
    console.error("item_funding failed:", error?.message);
    return map;
  }
  for (const row of data as {
    item_id: string;
    quantity_funded: number;
    amount_raised: number;
  }[]) {
    map.set(row.item_id, {
      quantity: Number(row.quantity_funded),
      amount: Number(row.amount_raised),
    });
  }
  return map;
}
