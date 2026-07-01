/**
 * Import the ACARA Australian Schools List (8 per-state .xlsx files) into
 * public.school_registry, which powers school address verification.
 *
 * Run with the portable Node from the project root:
 *   node kitup/scripts/import_school_registry.mjs
 *
 * Reads Supabase creds from kitup/.env.local (service-role key; bypasses RLS).
 */
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// --- env from ../.env.local ---
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

const DIR = "C:/Users/rosie.johnson/Desktop/Personal/EasyRaise2";
const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const rows = [];
for (const st of STATES) {
  const wb = XLSX.read(readFileSync(`${DIR}/ACARA_${st}_2026.xlsx`), {
    type: "buffer",
  });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  const hi = data.findIndex((r) => String(r[0]).trim() === "ACARA ID");
  if (hi < 0) {
    console.error(`! no header row in ${st}`);
    continue;
  }
  let kept = 0;
  for (let i = hi + 1; i < data.length; i++) {
    const r = data[i];
    const acara = String(r[0] ?? "").trim();
    const name = String(r[1] ?? "").trim();
    const status = String(r[7] ?? "").trim();
    if (!acara || !name) continue;
    if (status && status.toLowerCase() !== "open") continue; // current schools only
    const pc = String(r[4] ?? "").trim();
    rows.push({
      acara_id: acara,
      official_name: name,
      suburb: String(r[2] ?? "").trim() || null,
      state: String(r[3] ?? "").trim() || null,
      postcode: pc ? pc.padStart(4, "0") : null,
      latitude: r[11] !== "" && r[11] != null ? Number(r[11]) : null,
      longitude: r[12] !== "" && r[12] != null ? Number(r[12]) : null,
      source: "ACARA ASL 2026",
    });
    kept++;
  }
  console.log(`${st}: ${kept} open schools`);
}

// de-dupe by acara_id (defensive)
const byId = new Map(rows.map((r) => [r.acara_id, r]));
const unique = [...byId.values()];
console.log(`total unique schools: ${unique.length}`);

const BATCH = 500;
let done = 0;
for (let i = 0; i < unique.length; i += BATCH) {
  const chunk = unique.slice(i, i + BATCH);
  const { error } = await supabase
    .from("school_registry")
    .upsert(chunk, { onConflict: "acara_id" });
  if (error) {
    console.error(`batch @${i} failed:`, error.message);
    process.exit(1);
  }
  done += chunk.length;
  process.stdout.write(`\rupserted ${done}/${unique.length}`);
}
console.log("\nDONE");
