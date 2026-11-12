/**
 * Sync a SECOND Hart Sport product photo (the alternate / in-use shot) into the
 * app, so the picker + campaign page can show a click-through between two images.
 *
 *   npm run sync:images2            # download missing second images + DB + migration
 *   npm run sync:images2 -- --force # re-download every second image
 *   npm run sync:images2 -- --no-db # files + migration only, skip the DB write
 *
 * Primary image stays <sku>.webp (from sync:images). This adds <sku>-2.webp =
 * the product's SECOND distinct Shopify photo, and writes image_url_2.
 *
 * FIRST TIME ONLY: apply migration 0041 in Supabase, then flip
 * IMAGE2_COLUMN_READY -> true in lib/data.ts. Requires portable Node + sharp.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_PX = 800;
const WEBP_QUALITY = 78;
const DOWNLOAD_CONCURRENCY = 8;
const NAME_MATCH_FLOOR = 0.6;
const SHOPIFY_BASE = "https://hartsport.com.au";

const FORCE = process.argv.includes("--force");
const SKIP_DB = process.argv.includes("--no-db");

const HART_DIR = fileURLToPath(new URL("../public/hart/", import.meta.url));
const MIGRATION = fileURLToPath(
  new URL("../supabase/migrations/0041_hart_product_image2.sql", import.meta.url),
);

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

// Build sku -> [distinct image srcs] and title -> [distinct image srcs].
async function getHartImages() {
  const bySku = {};
  const byTitle = {};
  for (let page = 1; ; page++) {
    const r = await fetch(`${SHOPIFY_BASE}/products.json?limit=250&page=${page}`, {
      headers: { "User-Agent": "Mozilla/5.0 (KitUp image sync)" },
    });
    if (!r.ok) throw new Error(`Hart products.json HTTP ${r.status}`);
    const { products } = await r.json();
    if (!products || products.length === 0) break;
    for (const p of products) {
      const imgs = Array.from(
        new Set((p.images ?? []).map((im) => im.src).filter(Boolean)),
      );
      if (imgs.length && !byTitle[p.title]) byTitle[p.title] = imgs;
      for (const v of p.variants ?? []) {
        if (v.sku && !bySku[v.sku]) bySku[v.sku] = imgs;
      }
    }
    process.stdout.write(`\rfetching Hart catalogue… page ${page}`);
  }
  process.stdout.write("\n");
  return { bySku, byTitle };
}

const normTokens = (x) =>
  x
    .toLowerCase()
    .replace(/hart|set of|\bset\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

function buildNameMatcher(byTitle) {
  const idx = Object.entries(byTitle).map(([t, imgs]) => ({
    imgs,
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
    return bestScore >= NAME_MATCH_FLOOR ? best.imgs : null;
  };
}

function resolveImages(product, bySku, nameMatch) {
  const sku = product.hart_sku;
  if (bySku[sku]) return bySku[sku];
  const base = sku.replace(/-[A-Z]$/, "");
  if (bySku[base]) return bySku[base];
  return nameMatch(product.name);
}

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
      const out = `${HART_DIR}${job.sku}-2.webp`;
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
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker()));
  process.stdout.write("\n");
  return { ok, skipped, failed };
}

function writeMigration(resolved) {
  const esc = (s) => s.replace(/'/g, "''");
  const rows = resolved.map(
    (j) => `    ('${esc(j.sku)}', '/hart/${esc(j.sku)}-2.webp')`,
  );
  const sql = `-- ============================================================
--  0041 — second product image (in-use / alternate shot)
-- ============================================================
--  Adds image_url_2 to the catalogue mirror: the product's SECOND Hart Sport
--  photo, self-hosted at /public/hart/<sku>-2.webp (primary stays <sku>.webp).
--  Powers the two-image click-through. ${rows.length} products have a second
--  image; the rest show only the primary.
--
--  GENERATED FILE — re-run \`npm run sync:images2\` to refresh. Idempotent.
-- ============================================================

alter table public.hart_sport_products
    add column if not exists image_url_2 text;

update public.hart_sport_products p
   set image_url_2 = v.url
  from (values
${rows.join(",\n")}
  ) as v(sku, url)
 where p.hart_sku = v.sku;
`;
  writeFileSync(MIGRATION, sql);
}

async function updateDb(resolved) {
  const probe = await supabase
    .from("hart_sport_products")
    .select("image_url_2")
    .limit(1);
  if (probe.error?.code === "42703") {
    console.log(
      "\n! image_url_2 column not found — apply migration 0041 in Supabase first,\n" +
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
        .update({ image_url_2: `/hart/${job.sku}-2.webp` })
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
console.log("Kit Up · Hart SECOND product image sync\n");
const products = await getSeededProducts();
console.log(`catalogue products: ${products.length}`);
const { bySku, byTitle } = await getHartImages();
const nameMatch = buildNameMatcher(byTitle);

const resolved = [];
let noSecond = 0;
for (const p of products) {
  const imgs = resolveImages(p, bySku, nameMatch);
  // second DISTINCT image only
  const second = imgs && imgs.length > 1 ? imgs[1] : null;
  if (second) resolved.push({ sku: p.hart_sku, url: second });
  else noSecond++;
}
console.log(
  `products with a second image: ${resolved.length}  ·  without: ${noSecond}`,
);

const dl = await downloadAll(resolved);
console.log(
  `images: ${dl.ok} downloaded, ${dl.skipped} already present, ${dl.failed} failed`,
);

writeMigration(resolved);
console.log("wrote supabase/migrations/0041_hart_product_image2.sql");

if (!SKIP_DB) {
  const db = await updateDb(resolved);
  if (db.ready) console.log(`DB: image_url_2 set on ${db.updated} products`);
}
console.log("\nDone.");
