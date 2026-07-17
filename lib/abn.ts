/**
 * Australian Business Number (ABN) helpers — pure, usable on client & server.
 * Validation uses the official ABR modulus-89 checksum, so it catches typos
 * and fabricated numbers offline (no API needed).
 */

// Positional weights defined by the ABR checksum algorithm.
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Strip everything but digits. */
export function normalizeAbn(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** True if `raw` is 11 digits and passes the ABR modulus-89 checksum. */
export function isValidAbn(raw: string): boolean {
  const abn = normalizeAbn(raw);
  if (abn.length !== 11) return false;
  const digits = abn.split("").map(Number);
  digits[0] -= 1; // subtract 1 from the leading digit per the algorithm
  const sum = digits.reduce((acc, d, i) => acc + d * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/** Pretty format as "NN NNN NNN NNN" (falls back to input if not 11 digits). */
export function formatAbn(raw: string): string {
  const abn = normalizeAbn(raw);
  if (abn.length !== 11) return raw;
  return `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8, 11)}`;
}
