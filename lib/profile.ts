import "server-only";
import crypto from "node:crypto";

/**
 * Profile-editing feature (migration 0023). Gated OFF until the migration
 * is applied — flip to true afterwards. Until then the profile page shows a
 * "coming soon" notice and the actions no-op, so nothing reads the new
 * columns before they exist.
 */
export const PROFILE_EDIT_READY = true;

/** How long an email-verified edit window stays open. */
export const UNLOCK_WINDOW_MS = 30 * 60 * 1000; // 30 min
/** How long the emailed unlock link is valid. */
export const UNLOCK_LINK_TTL_MS = 60 * 60 * 1000; // 1 hour

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only-secret";

/** Sign a single-use-ish unlock token embedding the user id + expiry. */
export function signUnlockToken(userId: string, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/** Verify an unlock token; returns the userId if valid & unexpired, else null. */
export function verifyUnlockToken(token: string): string | null {
  try {
    const [b64, sig] = token.split(".");
    if (!b64 || !sig) return null;
    const payload = Buffer.from(b64, "base64url").toString();
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const [userId, expStr] = payload.split(".");
    if (!userId || Number(expStr) < Date.now()) return null;
    return userId;
  } catch {
    return null;
  }
}

/** True if the stored edit-unlock timestamp is still in the future. */
export function isUnlocked(editUnlockedUntil: string | null | undefined): boolean {
  if (!editUnlockedUntil) return false;
  return new Date(editUnlockedUntil).getTime() > Date.now();
}
