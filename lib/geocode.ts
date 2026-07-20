import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
export async function acaraCoordsForSchool(
  admin: SupabaseClient,
  school: { school: string; postcode: string | null },
): Promise<{ lat: number; lon: number } | null> {
  if (!school.postcode) return null;
  const { data } = await admin
    .from("school_registry")
    .select("official_name, latitude, longitude")
    .eq("postcode", school.postcode);
  if (!data || data.length === 0) return null;

  const target = new Set(norm(school.school));
  let best: { latitude: number | null; longitude: number | null } | null = null;
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
  if (!best || best.latitude == null || best.longitude == null) return null;
  return { lat: best.latitude, lon: best.longitude };
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
  const { data: s } = await admin
    .from("schools")
    .select("school, postcode, address")
    .eq("id", schoolId)
    .single();
  if (!s) return null;
  if (s.address && !opts.overwrite) return s.address;

  const coords = await acaraCoordsForSchool(admin, s);
  if (!coords) return s.address ?? null;
  const street = await reverseGeocodeStreet(coords.lat, coords.lon);
  if (!street) return s.address ?? null;

  await admin.from("schools").update({ address: street }).eq("id", schoolId);
  return street;
}
