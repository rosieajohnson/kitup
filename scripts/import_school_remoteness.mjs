/**
 * Populate school_registry.remoteness from the ACARA School Profile spreadsheet
 * (the "Geolocation" column: Major Cities / Inner Regional / Outer Regional /
 * Remote / Very Remote), joined to the registry by ACARA SML ID.
 *
 *   npm run import:remoteness            # uses the default source path below
 *   npm run import:remoteness -- "C:/path/School Profile 2025.xlsx"
 *
 * Requires migration 0029 applied (adds school_registry.remoteness). Reads
 * Supabase creds from ../.env.local (service-role; bypasses RLS).
 */
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SRC =
  process.argv[2] || "C:/Users/rosie.johnson/Downloads/School Profile 2024.xlsx";

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

// --- read the spreadsheet ---
const wb = XLSX.read(readFileSync(SRC), { type: "buffer" });
const sheet =
  wb.Sheets["SchoolProfile 2024"] ||
  wb.Sheets[wb.SheetNames.find((n) => /school ?profile/i.test(n))] ||
  wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  blankrows: false,
  defval: "",
});
const hi = rows.findIndex((r) => r.some((c) => /ACARA SML ID/i.test(String(c))));
const hdr = rows[hi].map((h) => String(h).trim());
const idCol = hdr.findIndex((h) => /ACARA SML ID/i.test(h));
const geoCol = hdr.findIndex((h) => /^Geolocation$/i.test(h));
if (idCol < 0 || geoCol < 0) {
  console.error("Could not find ACARA SML ID / Geolocation columns.");
  process.exit(1);
}

// --- group acara_ids by remoteness value ---
const byValue = new Map();
for (const r of rows.slice(hi + 1)) {
  const id = String(r[idCol]).trim();
  const geo = String(r[geoCol]).trim();
  if (!id || !geo) continue;
  if (!byValue.has(geo)) byValue.set(geo, []);
  byValue.get(geo).push(id);
}
console.log(
  "remoteness values:",
  [...byValue].map(([k, v]) => `${k}=${v.length}`).join(", "),
);

// --- update the registry, chunked ---
const CHUNK = 200;
let updated = 0;
for (const [value, ids] of byValue) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("school_registry")
      .update({ remoteness: value })
      .in("acara_id", chunk)
      .select("acara_id");
    if (error) {
      console.error(`update failed (${value} @${i}):`, error.message);
      process.exit(1);
    }
    updated += data?.length ?? 0;
    process.stdout.write(`\rupdated ${updated}`);
  }
}
console.log(`\nDone. Set remoteness on ${updated} registry rows.`);
