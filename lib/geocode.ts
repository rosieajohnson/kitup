import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ACARA remoteness (migration 0029 + `npm run import:remoteness`). Gated OFF
 * until the column exists and the registry is populated — flip to true
 * afterwards so sign-up stamps schools.remoteness.
 */
export const REMOTENESS_READY = true;

/**
 * ACARA equity/demographic markers (migration 0031 + `npm run import:demographics`).
 * Gated OFF until the columns exist and the registry is populated — flip to true
 * afterwards so the ASF impact email includes them.
 */
export const DEMOGRAPHICS_READY = true;

/**
 * Turn a school's authoritative ACARA coordinates into a deliverable street
 * address. ACARA only stores suburb/state/postcode, but it DOES store the
 * school's lat/long — reverse-geocoding those (via OpenStreetMap Nominatim)
 * yields the actual street line. Server-only; every call is best-effort and
 * returns null on any failure rather than throwing.
 *
 * Nominatim usage policy: set a descriptive User-Agent and keep volume low
 * (we only ever geocode real school accounts, not the whole 10k+ registry).
 */

/** Reverse-geocode coordinates to a street line, e.g. "195A Stewart Street". */
export async function reverseGeocodeStreet(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "KitUp/1.0 (school delivery address)" },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const a = j.address ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ").trim();
    return street || null;
  } catch {
    return null;
  }
}

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

/**
 * Find the school's ACARA registry row (by postcode, best name match) and
 * return its coordinates. Requires a client that can read school_registry
 * (service-role).
 */
export interface RegistryRow {
  official_name: string;
  latitude: number | null;
  longitude: number | null;
  remoteness?: string | null;
  total_enrolments?: number | null;
  icsea?: number | null;
  icsea_percentile?: number | null;
  sea_bottom_quarter?: number | null;
  indigenous_pct?: number | null;
  lbote_pct?: number | null;
}

export async function acaraMatchForSchool(
  admin: SupabaseClient,
  school: { school: string; postcode: string | null },
): Promise<RegistryRow | null> {
  if (!school.postcode) return null;
  const sel =
    "official_name, latitude, longitude" +
    (REMOTENESS_READY ? ", remoteness" : "") +
    (DEMOGRAPHICS_READY
      ? ", total_enrolments, icsea, icsea_percentile, sea_bottom_quarter, indigenous_pct, lbote_pct"
      : "");
  const { data: raw } = await admin
    .from("school_registry")
    .select(sel)
    .eq("postcode", school.postcode);
  const data = (raw ?? []) as unknown as RegistryRow[];
  if (data.length === 0) return null;

  const target = new Set(norm(school.school));
  let best: RegistryRow | null = null;
  let bestScore = -1;
  for (const r of data) {
    const toks = new Set(norm(r.official_name));
    let inter = 0;
    for (const w of target) if (toks.has(w)) inter++;
    const score = inter / (target.size + toks.size - inter || 1);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/**
 * Resolve and store a school's delivery street line in schools.address. Only
 * fills a blank address unless `overwrite` is set (so a school's confirmed edit
 * is never clobbered). Returns the address on file (existing or newly filled),
 * or null. Best-effort.
 */
export async function fillSchoolDeliveryAddress(
  admin: SupabaseClient,
  schoolId: string,
  opts: { overwrite?: boolean } = {},
): Promise<string | null> {
  const sel =
    "school, postcode, address" + (REMOTENESS_READY ? ", remoteness" : "");
  const { data: sRaw } = await admin
    .from("schools")
    .select(sel)
    .eq("id", schoolId)
    .single();
  const s = sRaw as unknown as {
    school: string;
    postcode: string | null;
    address: string | null;
    remoteness?: string | null;
  } | null;
  if (!s) return null;

  const match = await acaraMatchForSchool(admin, s);
  const update: Record<string, unknown> = {};

  // Delivery street: reverse-geocode the ACARA coordinates (fill blank only,
  // unless overwriting, so a school's confirmed address is never clobbered).
  if ((!s.address || opts.overwrite) && match?.latitude != null && match.longitude != null) {
    const street = await reverseGeocodeStreet(match.latitude, match.longitude);
    if (street) update.address = street;
  }
  // Remoteness: stamp from the matched registry row if not already set.
  if (REMOTENESS_READY && match?.remoteness && !s.remoteness) {
    update.remoteness = match.remoteness;
  }

  if (Object.keys(update).length) {
    await admin.from("schools").update(update).eq("id", schoolId);
  }
  return (update.address as string) ?? s.address ?? null;
}
