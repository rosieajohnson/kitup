"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { resolveActiveSchool, canManageSchool, TEAM_ACCESS_READY } from "@/lib/team";
import { notifyMemberInvite, notifyMemberAdded } from "@/lib/notify";

type InviteRole = "editor" | "contributor";
const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  editor: "Editor",
  contributor: "Contributor",
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Verify the caller is the owner of a school; returns the school id. */
async function requireOwner(): Promise<
  { schoolId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };
  const active = await resolveActiveSchool(supabase, user.id);
  if (!active) return { error: "No school account found." };
  if (!canManageSchool(active.role)) {
    return { error: "Only the school owner can manage team members." };
  }
  return { schoolId: active.schoolId };
}

/** Find an existing auth user by email (small user base — paginated scan). */
async function findUserByEmail(admin: SupabaseClient, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (users.length < 1000) break;
  }
  return null;
}

export async function inviteMember(
  email: string,
  role: InviteRole,
): Promise<{ ok?: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !TEAM_ACCESS_READY) {
    return { error: "Team access isn't enabled yet." };
  }
  const cleanEmail = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return { error: "Enter a valid email address." };
  if (role !== "editor" && role !== "contributor") return { error: "Pick a role." };

  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };
  const { schoolId } = gate;

  const admin = createAdminClient();
  const { data: sch } = await admin
    .from("schools")
    .select("school")
    .eq("id", schoolId)
    .maybeSingle();
  const schoolName = sch?.school ?? "your school";

  // Create the invited user, or find them if they already have an account.
  let userId: string | null = null;
  let isNew = false;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    email_confirm: true,
    user_metadata: { role: "member" }, // not school/donor → trigger provisions nothing
  });
  if (created?.user) {
    userId = created.user.id;
    isNew = true;
  } else {
    const existing = await findUserByEmail(admin, cleanEmail);
    if (!existing) return { error: createErr?.message ?? "Couldn't invite that email." };
    userId = existing.id;
  }

  if (userId === schoolId) return { error: "That's the owner's own email." };

  const { error: upErr } = await admin
    .from("school_members")
    .upsert({ school_id: schoolId, user_id: userId, role }, { onConflict: "school_id,user_id" });
  if (upErr) return { error: upErr.message };

  // Email them (best-effort).
  try {
    if (isNew) {
      const origin =
        (await headers()).get("origin") ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "https://kitup.tech";
      const { data: link } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: cleanEmail,
      });
      const tokenHash = link?.properties?.hashed_token;
      const setupLink = tokenHash
        ? `${origin}/auth/confirm?token_hash=${tokenHash}&type=recovery&next=/reset-password`
        : `${origin}/sign-in`;
      await notifyMemberInvite({ email: cleanEmail, schoolName, roleLabel: ROLE_LABEL[role], setupLink });
    } else {
      await notifyMemberAdded({ email: cleanEmail, schoolName, roleLabel: ROLE_LABEL[role] });
    }
  } catch {
    /* best-effort */
  }

  revalidatePath("/dashboard/team");
  return { ok: true };
}

export async function changeMemberRole(
  userId: string,
  role: InviteRole,
): Promise<{ ok?: boolean; error?: string }> {
  if (!TEAM_ACCESS_READY) return { error: "Team access isn't enabled yet." };
  if (role !== "editor" && role !== "contributor") return { error: "Pick a role." };
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("school_members")
    .update({ role })
    .eq("school_id", gate.schoolId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/team");
  return { ok: true };
}

export async function removeMember(
  userId: string,
): Promise<{ ok?: boolean; error?: string }> {
  if (!TEAM_ACCESS_READY) return { error: "Team access isn't enabled yet." };
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("school_members")
    .delete()
    .eq("school_id", gate.schoolId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/team");
  return { ok: true };
}
