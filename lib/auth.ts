import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { UserRole } from "@/lib/types";
import { resolveActiveSchool, type SchoolRole } from "@/lib/team";

export interface Viewer {
  userId: string | null;
  role: UserRole | null;
  /** Display name: the donor's name or the school's name. */
  name: string | null;
  /** Platform admin (ASF) — can see every campaign's report. */
  isAdmin: boolean;
  /**
   * The school this user manages (their own, or one they're a member of), and
   * their role in it. Null for donors / users with no school. For a school
   * owner, schoolId === userId. Use schoolId (not userId) for all school-scoped
   * dashboard reads/writes so team members resolve correctly.
   */
  schoolId: string | null;
  schoolRole: SchoolRole | null;
}

/**
 * The current viewer's id, role (school/donor) and display name, or
 * nulls when signed out or on the mock/dev path. Pages use this to
 * decide what actions to show — e.g. only donors get to fund items.
 */
export async function getViewer(): Promise<Viewer> {
  const empty: Viewer = {
    userId: null,
    role: null,
    name: null,
    isAdmin: false,
    schoolId: null,
    schoolRole: null,
  };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as UserRole) ?? null;
  const isAdmin = Boolean(profile?.is_admin);

  // Which school does this user manage (own, or a member of), and what role.
  const active = await resolveActiveSchool(supabase, user.id);

  let name: string | null = null;
  if (active) {
    const { data } = await supabase
      .from("schools")
      .select("school")
      .eq("id", active.schoolId)
      .single();
    name = data?.school ?? null;
  } else if (role === "donor") {
    const { data } = await supabase
      .from("donors")
      .select("name")
      .eq("id", user.id)
      .single();
    name = data?.name ?? null;
  }

  return {
    userId: user.id,
    role,
    name,
    isAdmin,
    schoolId: active?.schoolId ?? null,
    schoolRole: active?.role ?? null,
  };
}
