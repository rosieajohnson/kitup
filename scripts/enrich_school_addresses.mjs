/**
 * Fill delivery street addresses for existing school accounts by reverse-
 * geocoding their ACARA coordinates (OpenStreetMap Nominatim).
 *
 *   npm run enrich:addresses            # fill schools with a blank address
 *   npm run enrich:addresses -- --force # re-geocode all schools (overwrite)
 *
 * Only touches real school accounts (not the 10k+ registry), and paces requests
 * ~1/sec per Nominatim's usage policy. Leaves delivery_confirmed = false so the
 * school still confirms/corrects the address in their profile.
 *
 * Reads Supabase creds from ../.env.local (service-role key; bypasses RLS).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const FORCE = process.argv.includes("--force");

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

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "KitUp/1.0 (school delivery address enrichment)" },
  });
  if (!res.ok) return null;
  const j = await res.json();
  const a = j.address ?? {};
  return [a.house_number, a.road].filter(Boolean).join(" ").trim() || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: schools, error } = await supabase
  .from("schools")
  .select("id, school, postcode, address");
if (error) {
  console.error("Failed to read schools:", error.message);
  process.exit(1);
}

const todo = schools.filter((s) => (FORCE || !s.address) && s.postcode);
console.log(
  `schools: ${schools.length}, to geocode: ${todo.length}${FORCE ? " (force)" : ""}`,
);

let ok = 0,
  miss = 0;
for (const s of todo) {
  const { data: reg } = await supabase
    .from("school_registry")
    .select("official_name, latitude, longitude")
    .eq("postcode", s.postcode);
  if (!reg || reg.length === 0) {
    miss++;
    console.log(`  ✗ ${s.school}: no ACARA row at ${s.postcode}`);
    continue;
  }
  const target = new Set(norm(s.school));
  let best = null,
    bestScore = -1;
  for (const r of reg) {
    const toks = new Set(norm(r.official_name));
    let inter = 0;
    for (const w of target) if (toks.has(w)) inter++;
    const score = inter / (target.size + toks.size - inter || 1);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best || best.latitude == null) {
    miss++;
    continue;
  }
  const street = await reverseGeocode(best.latitude, best.longitude);
  if (!street) {
    miss++;
    console.log(`  ✗ ${s.school}: no street from geocode`);
    await sleep(1100);
    continue;
  }
  const { error: upErr } = await supabase
    .from("schools")
    .update({ address: street })
    .eq("id", s.id);
  if (upErr) {
    miss++;
    console.error(`  ✗ ${s.school}: ${upErr.message}`);
  } else {
    ok++;
    console.log(`  ✓ ${s.school}: ${street}`);
  }
  await sleep(1100); // Nominatim: ~1 req/sec
}
console.log(`\nDone. filled ${ok}, skipped/failed ${miss}.`);
