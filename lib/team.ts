import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Multi-user school access (migration 0038). Gated OFF until the migration is
 * applied and the invite flow is finished — flip to true to switch on member
 * resolution + the invite UI. While off, only the school OWNER (schools.id =
 * auth.uid()) is ever resolved, so behaviour is identical to single-login.
 */
export const TEAM_ACCESS_READY = true;

export type SchoolRole = "owner" | "editor" | "contributor";

export interface ActiveSchool {
  schoolId: string;
  role: SchoolRole;
}

/**
 * Resolve which school the given user manages, and their role:
 *   - owns a school (schools.id = userId) → that school, role 'owner'
 *   - else (team access on) an accepted member → their school + membership role
 *   - else null (donor, or a user with no school).
 * Uses the caller's own (RLS-scoped) client.
 */
export async function resolveActiveSchool(
  client: SupabaseClient,
  userId: string,
): Promise<ActiveSchool | null> {
  const { data: own } = await client
    .from("schools")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (own?.id) return { schoolId: own.id as string, role: "owner" };

  if (!TEAM_ACCESS_READY) return null;

  const { data: m } = await client
    .from("school_members")
    .select("school_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (m?.school_id) {
    return { schoolId: m.school_id as string, role: m.role as SchoolRole };
  }
  return null;
}

/** Roles allowed to publish/close a campaign (contributors cannot). */
export function canPublish(role: SchoolRole | null): boolean {
  return role === "owner" || role === "editor";
}

/** Roles allowed to manage members + edit the school profile/ABN (owner only). */
export function canManageSchool(role: SchoolRole | null): boolean {
  return role === "owner";
}
