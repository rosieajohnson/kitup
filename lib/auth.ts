import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { UserRole } from "@/lib/types";

export interface Viewer {
  userId: string | null;
  role: UserRole | null;
  /** Display name: the donor's name or the school's name. */
  name: string | null;
  /** Platform admin (ASF) — can see every campaign's report. */
  isAdmin: boolean;
}

/**
 * The current viewer's id, role (school/donor) and display name, or
 * nulls when signed out or on the mock/dev path. Pages use this to
 * decide what actions to show — e.g. only donors get to fund items.
 */
export async function getViewer(): Promise<Viewer> {
  if (!isSupabaseConfigured())
    return { userId: null, role: null, name: null, isAdmin: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null, name: null, isAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as UserRole) ?? null;
  const isAdmin = Boolean(profile?.is_admin);

  let name: string | null = null;
  if (role === "donor") {
    const { data } = await supabase
      .from("donors")
      .select("name")
      .eq("id", user.id)
      .single();
    name = data?.name ?? null;
  } else if (role === "school") {
    const { data } = await supabase
      .from("schools")
      .select("school")
      .eq("id", user.id)
      .single();
    name = data?.school ?? null;
  }

  return { userId: user.id, role, name, isAdmin };
}
