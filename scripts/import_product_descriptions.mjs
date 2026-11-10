/**
 * Populate hart_sport_products.description from the Hart Sport Shopify catalogue
 * (body_html, cleaned to plain text). Shown on the public campaign item so donors
 * see what a product is — including how many of what is in a set/pack.
 *
 *   npm run import:descriptions
 *
 * Requires migration 0040 applied. Update-only (matches existing SKUs; never
 * inserts). Reads Supabase creds from ../.env.local (service-role key).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SHOPIFY_BASE = "https://hartsport.com.au";
const MAX_LEN = 600;
// Kits/sets list their contents (incl. quantities); never truncate that list.
const KIT_MAX_LEN = 1800;
const CONTENTS_RE =
  /\b(kit includes?|set includes?|includes?|contains?|consisting of|comprising|kit of)\b/i;

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function clean(html) {
  let t = (html || "")
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|div|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Allow a longer description for kits so the contents list isn't cut off.
  const cap = CONTENTS_RE.test(t) ? KIT_MAX_LEN : MAX_LEN;
  if (t.length > cap) {
    t = t.slice(0, cap);
    const cut = t.lastIndexOf(" ");
    if (cut > 0) t = t.slice(0, cut);
    t = t.replace(/[.,;:]$/, "") + "…";
  }
  return t;
}

// --- seeded catalogue SKUs ---
const existing = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("hart_sport_products")
    .select("hart_sku")
    .range(from, from + 999);
  if (error) {
    console.error("read catalogue failed:", error.message);
    process.exit(1);
  }
  data.forEach((r) => existing.add(r.hart_sku));
  if (data.length < 1000) break;
}
console.log("catalogue SKUs:", existing.size);

// --- Shopify descriptions, keyed by SKU (+ base SKU fallback) ---
const bySku = {};
const byBase = {};
for (let page = 1; page <= 25; page++) {
  const r = await fetch(`${SHOPIFY_BASE}/products.json?limit=250&page=${page}`, {
    headers: { "User-Agent": "KitUp/1.0 (catalogue descriptions)" },
  });
  if (!r.ok) {
    console.error(`products.json HTTP ${r.status}`);
    break;
  }
  const prods = (await r.json()).products ?? [];
  if (prods.length === 0) break;
  for (const p of prods) {
    const desc = clean(p.body_html);
    if (!desc) continue;
    for (const v of p.variants ?? []) {
      if (!v.sku) continue;
      if (!bySku[v.sku]) bySku[v.sku] = desc;
      const base = v.sku.replace(/-[A-Za-z]$/, "");
      if (!byBase[base]) byBase[base] = desc;
    }
  }
  if (prods.length < 250) break;
}
console.log("Shopify SKUs with descriptions:", Object.keys(bySku).length);

// --- match + update ---
const updates = [];
for (const sku of existing) {
  const desc = bySku[sku] || byBase[sku.replace(/-[A-Za-z]$/, "")] || null;
  if (desc) updates.push({ sku, description: desc });
}
console.log("matched descriptions:", updates.length);

const CHUNK = 50;
let done = 0;
for (let i = 0; i < updates.length; i += CHUNK) {
  const chunk = updates.slice(i, i + CHUNK);
  const results = await Promise.all(
    chunk.map((u) =>
      supabase
        .from("hart_sport_products")
        .update({ description: u.description })
        .eq("hart_sku", u.sku),
    ),
  );
  const err = results.find((r) => r.error);
  if (err?.error) {
    console.error(`update @${i} failed:`, err.error.message);
    process.exit(1);
  }
  done += chunk.length;
  process.stdout.write(`\rupdated ${done}/${updates.length}`);
}
console.log("\nDone.");
