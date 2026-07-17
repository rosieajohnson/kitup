import "server-only";
import { isValidAbn, normalizeAbn } from "@/lib/abn";

/**
 * ABN Lookup (Australian Business Register) integration. Uses the official
 * free JSON web service, which requires a registered authentication GUID in
 * ABR_GUID (https://abr.business.gov.au/Tools/WebServices). Server-only.
 *
 * Degrades gracefully: with no GUID, or on any lookup failure, `ok` is false
 * and the caller leaves the school unverified (advisory — never blocks).
 */
export interface AbrResult {
  ok: boolean;
  abn: string;
  status: string | null; // e.g. "Active"
  entityName: string | null; // registered legal/entity name
  businessNames: string[]; // trading names
  reason?: string; // why !ok (no_guid, invalid_checksum, not_found, http_x…)
}

export async function lookupAbn(rawAbn: string): Promise<AbrResult> {
  const abn = normalizeAbn(rawAbn);
  const base: AbrResult = {
    ok: false,
    abn,
    status: null,
    entityName: null,
    businessNames: [],
  };

  if (!isValidAbn(abn)) return { ...base, reason: "invalid_checksum" };
  const guid = process.env.ABR_GUID;
  if (!guid) return { ...base, reason: "no_guid" };

  try {
    const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&guid=${guid}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ...base, reason: `http_${res.status}` };

    // The endpoint returns JSONP: callback({...}). Unwrap to JSON.
    const text = (await res.text()).trim();
    const m = text.match(/^[A-Za-z0-9_$.]*\((.*)\)\s*;?$/s);
    const json = JSON.parse(m ? m[1] : text);

    const entityName: string | null = json.EntityName || null;
    const status: string | null = json.AbnStatus || null;
    const businessNames: string[] = Array.isArray(json.BusinessName)
      ? json.BusinessName.filter(Boolean)
      : [];

    // ABR returns a Message (e.g. "Search text is not a valid ABN") on failure.
    if (!entityName && json.Message) return { ...base, reason: String(json.Message) };
    if (!entityName) return { ...base, reason: "not_found" };

    return { ok: true, abn, status, entityName, businessNames };
  } catch {
    return { ...base, reason: "fetch_error" };
  }
}

/** Normalise a name for comparison: upper-case, expand common school
 *  abbreviations, and drop generic words so distinctive tokens remain. */
function normName(s: string): string {
  return (s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\bNTH\b/g, "NORTH")
    .replace(/\bSTH\b/g, "SOUTH")
    .replace(/\bST\b/g, "SAINT")
    .replace(/\bMT\b/g, "MOUNT")
    .replace(/\bPS\b/g, "PRIMARY SCHOOL")
    .replace(/\bSC\b/g, "SECONDARY COLLEGE")
    .replace(
      /\b(THE|SCHOOL|COLLEGE|PRIMARY|SECONDARY|CAMPUS|INC|LTD|PTY|AND)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaccard token overlap of two names, 0..1. */
export function nameMatchScore(a: string, b: string): number {
  const A = new Set(normName(a).split(" ").filter(Boolean));
  const B = new Set(normName(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = new Set([...A, ...B]).size;
  return inter / union;
}

/** True if the school name confidently matches the ABR entity or a trading
 *  name (default threshold 0.6 Jaccard). */
export function namesMatch(
  schoolName: string,
  entityName: string | null,
  businessNames: string[] = [],
  threshold = 0.6,
): boolean {
  return [entityName, ...businessNames]
    .filter((c): c is string => Boolean(c))
    .some((c) => nameMatchScore(c, schoolName) >= threshold);
}
