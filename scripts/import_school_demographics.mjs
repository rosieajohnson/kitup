/**
 * Populate school_registry equity/demographic markers from the ACARA School
 * Profile spreadsheet (joined by ACARA SML ID): total enrolments, ICSEA, ICSEA
 * percentile, bottom SEA quarter % (low-SES), Indigenous %, and LBOTE %.
 *
 *   npm run import:demographics            # default source path
 *   npm run import:demographics -- "C:/path/School Profile 2025.xlsx"
 *
 * Requires migration 0031 applied. Update-only (filtered to acara_ids already in
 * the registry — never inserts). Reads Supabase creds from ../.env.local.
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
const col = (re) => hdr.findIndex((h) => re.test(h));
const C = {
  id: col(/ACARA SML ID/i),
  total: col(/^Total Enrolments/i),
  icsea: col(/^ICSEA$/i),
  pct: col(/ICSEA Percentile/i),
  sea: col(/Bottom SEA Quarter/i),
  indig: col(/Indigenous Enrolments/i),
  lbote: col(/Language Background Other Than English - Yes/i),
};
if (Object.values(C).some((i) => i < 0)) {
  console.error("Missing expected column(s):", C);
  process.exit(1);
}
const num = (v) => {
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Registry acara_ids that exist — so we only UPDATE, never insert.
const existing = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("school_registry")
    .select("acara_id")
    .range(from, from + 999);
  if (error) {
    console.error("read registry failed:", error.message);
    process.exit(1);
  }
  data.forEach((r) => existing.add(r.acara_id));
  if (data.length < 1000) break;
}
console.log("registry rows:", existing.size);

const updates = [];
for (const r of rows.slice(hi + 1)) {
  const acara_id = String(r[C.id]).trim();
  if (!acara_id || !existing.has(acara_id)) continue;
  updates.push({
    acara_id,
    total_enrolments: num(r[C.total]),
    icsea: num(r[C.icsea]),
    icsea_percentile: num(r[C.pct]),
    sea_bottom_quarter: num(r[C.sea]),
    indigenous_pct: num(r[C.indig]),
    lbote_pct: num(r[C.lbote]),
  });
}
console.log("rows to update:", updates.length);

// Real UPDATEs (rows all exist — we filtered to existing acara_ids). Can't use
// upsert here: INSERT...ON CONFLICT still validates NOT NULL (official_name) on
// the proposed insert row. Run in parallel chunks to keep it quick.
const CHUNK = 50;
let done = 0;
for (let i = 0; i < updates.length; i += CHUNK) {
  const chunk = updates.slice(i, i + CHUNK);
  const results = await Promise.all(
    chunk.map(({ acara_id, ...fields }) =>
      supabase.from("school_registry").update(fields).eq("acara_id", acara_id),
    ),
  );
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) {
    console.error(`update @${i} failed:`, firstErr.error.message);
    process.exit(1);
  }
  done += chunk.length;
  process.stdout.write(`\rupdated ${done}/${updates.length}`);
}
console.log("\nDone.");
