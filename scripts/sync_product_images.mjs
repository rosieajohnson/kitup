/**
 * Sync Hart Sport product photos into the app.
 *
 *   npm run sync:images            # download missing, refresh DB + migration
 *   npm run sync:images -- --force # re-download every image (Hart updated photos)
 *   npm run sync:images -- --no-db # only touch files + migration, skip the DB write
 *
 * What it does, end to end:
 *   1. Reads the seeded catalogue SKUs from Supabase (service-role, bypasses RLS).
 *   2. Pulls the Hart Sport Shopify catalogue (products.json) and matches each
 *      SKU to a product image (exact SKU -> base SKU -> fuzzy name match).
 *   3. Downloads each image, resizes to <=800px, writes public/hart/<sku>.webp.
 *   4. Regenerates supabase/migrations/0025_hart_product_images.sql (version
 *      control + fresh-deploy bootstrap) AND, if the image_url column already
 *      exists, writes the URLs straight to the DB so no SQL step is needed.
 *
 * Requires the portable Node (see the repo's Node setup) and `sharp`
 * (devDependency). Run from the kitup/ project root.
 *
 * FIRST TIME ONLY: apply migration 0025 in the Supabase SQL editor to create
 * the column, then flip IMAGE_COLUMN_READY -> true in lib/data.ts. After that,
 * this script keeps everything in sync on its own.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---- tunables ----
const MAX_PX = 800; // longest edge of the stored image
const WEBP_QUALITY = 78;
const DOWNLOAD_CONCURRENCY = 8;
const NAME_MATCH_FLOOR = 0.6; // Jaccard token overlap for fuzzy name fallback
const SHOPIFY_BASE = "https://hartsport.com.au";

const FORCE = process.argv.includes("--force");
const SKIP_DB = process.argv.includes("--no-db");

// ---- paths (resolved relative to this file, so cwd doesn't matter) ----
const HART_DIR = fileURLToPath(new URL("../public/hart/", import.meta.url));
const MIGRATION = fileURLToPath(
  new URL("../supabase/migrations/0025_hart_product_images.sql", import.meta.url),
);

// ---- env from ../.env.local ----
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

// ---- 1. seeded catalogue SKUs ----
async function getSeededProducts() {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("hart_sport_products")
      .select("id, hart_sku, name")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Failed to read catalogue:", error.message);
      process.exit(1);
    }
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

// ---- 2. Hart Shopify catalogue -> SKU/name -> image ----
async function getHartMap() {
  const map = {}; // sku -> imageUrl
  const byTitle = {}; // title -> imageUrl (for fuzzy fallback)
  for (let page = 1; ; page++) {
    const r = await fetch(
      `${SHOPIFY_BASE}/products.json?limit=250&page=${page}`,
      { headers: { "User-Agent": "Mozilla/5.0 (KitUp image sync)" } },
    );
    if (!r.ok) throw new Error(`Hart products.json HTTP ${r.status}`);
    const { products } = await r.json();
    if (!products || products.length === 0) break;
    for (const p of products) {
      const prodImg = p.images?.[0]?.src ?? null;
      const imgById = {};
      for (const im of p.images ?? []) imgById[im.id] = im.src;
      if (prodImg && !byTitle[p.title]) byTitle[p.title] = prodImg;
      for (const v of p.variants ?? []) {
        if (!v.sku) continue;
        const img =
          v.featured_image?.src ??
          (v.featured_image && imgById[v.featured_image.id]) ??
          prodImg;
        if (img && !map[v.sku]) map[v.sku] = img;
      }
    }
    process.stdout.write(`\rfetching Hart catalogue… page ${page}`);
  }
  process.stdout.write("\n");
  return { map, byTitle };
}

// fuzzy name match: Jaccard overlap of significant tokens
const normTokens = (x) =>
  x
    .toLowerCase()
    .replace(/hart|set of|\bset\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

function buildNameMatcher(byTitle) {
  const idx = Object.entries(byTitle).map(([t, img]) => ({
    img,
    toks: new Set(normTokens(t)),
  }));
  return (name) => {
    const a = new Set(normTokens(name));
    let best = null,
      bestScore = 0;
    for (const c of idx) {
      let inter = 0;
      for (const w of a) if (c.toks.has(w)) inter++;
      const j = inter / (a.size + c.toks.size - inter || 1);
      if (j > bestScore) {
        bestScore = j;
        best = c;
      }
    }
    return bestScore >= NAME_MATCH_FLOOR ? best.img : null;
  };
}

function resolveImage(product, map, nameMatch) {
  const sku = product.hart_sku;
  if (map[sku]) return map[sku];
  const base = sku.replace(/-[A-Z]$/, ""); // e.g. 9-829-N -> 9-829
  if (map[base]) return map[base];
  return nameMatch(product.name);
}

// ---- 3. download + convert ----
async function downloadAll(jobs) {
  mkdirSync(HART_DIR, { recursive: true });
  let ok = 0,
    skipped = 0,
    failed = 0;
  const queue = [...jobs];
  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const out = `${HART_DIR}${job.sku}.webp`;
      if (!FORCE && existsSync(out)) {
        skipped++;
        continue;
      }
      try {
        const r = await fetch(job.url, {
          headers: { "User-Agent": "Mozilla/5.0 (KitUp image sync)" },
        });
        if (!r.ok) {
          failed++;
          console.error(`\n  HTTP ${r.status} for ${job.sku}`);
          continue;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        await sharp(buf)
          .resize(MAX_PX, MAX_PX, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(out);
        ok++;
      } catch (e) {
        failed++;
        console.error(`\n  ERR ${job.sku}: ${e.message}`);
      }
      process.stdout.write(
        `\rdownloading… ${ok} new, ${skipped} kept, ${failed} failed`,
      );
    }
  }
  await Promise.all(
    Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker()),
  );
  process.stdout.write("\n");
  return { ok, skipped, failed };
}

// ---- 4a. regenerate the migration file ----
function writeMigration(resolved) {
  const esc = (s) => s.replace(/'/g, "''");
  const rows = resolved.map(
    (j) => `    ('${esc(j.sku)}', '/hart/${esc(j.sku)}.webp')`,
  );
  const sql = `-- ============================================================
--  0025 — Hart product images (self-hosted)
-- ============================================================
--  Adds image_url to the catalogue mirror and points each product at a
--  locally-served WebP in /public/hart/<sku>.webp. Images are sourced from
--  the Hart Sport Shopify catalogue (matched by SKU), resized and converted
--  to WebP by scripts/sync_product_images.mjs. ${rows.length} products matched;
--  the rest fall back to no image in the UI.
--
--  GENERATED FILE — re-run \`npm run sync:images\` to refresh. Idempotent.
-- ============================================================

alter table public.hart_sport_products
    add column if not exists image_url text;

update public.hart_sport_products p
   set image_url = v.url
  from (values
${rows.join(",\n")}
  ) as v(sku, url)
 where p.hart_sku = v.sku;
`;
  writeFileSync(MIGRATION, sql);
}

// ---- 4b. write image_url straight to the DB (if the column exists) ----
async function updateDb(resolved) {
  // Probe once: does image_url exist yet?
  const probe = await supabase
    .from("hart_sport_products")
    .select("image_url")
    .limit(1);
  if (probe.error?.code === "42703") {
    console.log(
      "\n! image_url column not found — apply migration 0025 in Supabase first,\n" +
        "  then re-run. (Files + migration are already written.)",
    );
    return { updated: 0, ready: false };
  }
  let updated = 0;
  const queue = [...resolved];
  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const { error } = await supabase
        .from("hart_sport_products")
        .update({ image_url: `/hart/${job.sku}.webp` })
        .eq("hart_sku", job.sku);
      if (!error) updated++;
      process.stdout.write(`\rwriting DB… ${updated}/${resolved.length}`);
    }
  }
  await Promise.all(Array.from({ length: 10 }, () => worker()));
  process.stdout.write("\n");
  return { updated, ready: true };
}

// ---- run ----
console.log("Kit Up · Hart product image sync\n");
const products = await getSeededProducts();
console.log(`catalogue products: ${products.length}`);
const { map, byTitle } = await getHartMap();
console.log(`Hart SKUs with images: ${Object.keys(map).length}`);

const nameMatch = buildNameMatcher(byTitle);
const resolved = [];
const unmatched = [];
for (const p of products) {
  const url = resolveImage(p, map, nameMatch);
  if (url) resolved.push({ sku: p.hart_sku, url });
  else unmatched.push(`${p.hart_sku}  ${p.name}`);
}
console.log(`matched: ${resolved.length}  ·  unmatched: ${unmatched.length}`);

const dl = await downloadAll(resolved);
console.log(
  `images: ${dl.ok} downloaded, ${dl.skipped} already present, ${dl.failed} failed`,
);

writeMigration(resolved);
console.log("wrote supabase/migrations/0025_hart_product_images.sql");

if (!SKIP_DB) {
  const db = await updateDb(resolved);
  if (db.ready) console.log(`DB: image_url set on ${db.updated} products`);
}

if (unmatched.length) {
  console.log(`\n${unmatched.length} products without an image:`);
  console.log(unmatched.map((u) => "  " + u).join("\n"));
}
console.log("\nDone.");
