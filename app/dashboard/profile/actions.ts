"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_EDIT_READY,
  DELIVERY_CONFIRM_READY,
  UNLOCK_LINK_TTL_MS,
  signUnlockToken,
  isUnlocked,
} from "@/lib/profile";
import { normalizeAbn, isValidAbn } from "@/lib/abn";
import { lookupAbn, namesMatch } from "@/lib/abr";
import { originFromHeaders } from "@/lib/http";

const AU_PHONE = /^(?:\+?61|0)\d{9}$/;

/** Email the signed-in user a link that unlocks profile editing for a window. */
export async function requestEditUnlock(): Promise<{ ok?: boolean; error?: string }> {
  if (!PROFILE_EDIT_READY) return { error: "Profile editing isn't available yet." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Please sign in first." };

  const token = signUnlockToken(user.id, Date.now() + UNLOCK_LINK_TTL_MS);
  const origin = originFromHeaders(
    await headers(),
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  );
  const link = `${origin}/dashboard/profile/unlock?t=${encodeURIComponent(token)}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("requestEditUnlock: RESEND_API_KEY not set — no email sent");
    return { ok: true };
  }
  const from = process.env.CONTACT_FROM_EMAIL || "Kit Up <onboarding@resend.dev>";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:auto">
    <h1 style="font-size:22px;color:#15241c">Confirm it's you</h1>
    <p style="color:#4c5a52;font-size:15px;line-height:1.6">Click below to unlock editing your Kit&nbsp;Up profile for the next 30 minutes.</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 28px;background:#ff5a3c;color:#fff;text-decoration:none;border-radius:9999px;font-weight:700">Unlock profile editing</a></p>
    <p style="color:#7c887f;font-size:12px">If you didn't request this, you can ignore this email.</p>
  </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [user.email],
        subject: "Unlock editing your Kit Up profile",
        html,
        text: `Unlock editing your Kit Up profile (valid 1 hour):\n${link}`,
      }),
    });
  } catch (err) {
    console.error("requestEditUnlock send failed:", err);
  }
  return { ok: true };
}

export interface ProfileUpdateResult {
  ok?: boolean;
  error?: string;
  emailPending?: boolean;
}

/** Save profile edits. Requires an active email-verified unlock. Blocks a
 *  school-name change that fails the ACARA or ABN checks. */
export async function updateProfile(
  formData: FormData,
): Promise<ProfileUpdateResult> {
  if (!PROFILE_EDIT_READY) return { error: "Profile editing isn't available yet." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, edit_unlocked_until")
    .eq("id", user.id)
    .single();
  if (!isUnlocked(profile?.edit_unlocked_until)) {
    return { error: "Verify your email first to edit your profile." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("contact_phone") ?? "").replace(/[\s-]/g, "");
  if (phone && !AU_PHONE.test(phone)) {
    return { error: "Enter a valid Australian phone number, or leave it blank." };
  }

  let emailPending = false;
  const changeEmail = async (): Promise<string | null> => {
    if (!email || email === user.email) return null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email address.";
    const { error } = await supabase.auth.updateUser({ email });
    if (error) return error.message;
    emailPending = true;
    return null;
  };

  if (profile?.role === "school") {
    const { data: cur } = await supabase
      .from("schools")
      .select("school, suburb, postcode, address, abn")
      .eq("id", user.id)
      .single();

    const school = String(formData.get("school") ?? "").trim();
    const suburb = String(formData.get("suburb") ?? "").trim();
    const postcode = String(formData.get("postcode") ?? "").trim();
    const abn = normalizeAbn(String(formData.get("abn") ?? ""));
    const address = String(formData.get("address") ?? "").trim();

    if (!school) return { error: "School name can't be empty." };
    if (!/^[0-9]{4}$/.test(postcode)) {
      return { error: "Enter a valid 4-digit postcode (it's checked against ACARA)." };
    }
    if (!isValidAbn(abn)) {
      return { error: "Enter a valid 11-digit ABN (it failed the checksum)." };
    }

    const nameOrLocalityChanged =
      school !== cur?.school || suburb !== (cur?.suburb ?? "") || postcode !== (cur?.postcode ?? "");
    const abnOrNameChanged = abn !== (cur?.abn ?? "") || school !== cur?.school;

    // ACARA gate — must still match the registry.
    if (nameOrLocalityChanged) {
      const { data: check } = await supabase.rpc("check_school_address", {
        p_school: school,
        p_address: cur?.address ?? null,
        p_suburb: suburb || null,
        p_postcode: postcode || null,
      });
      if ((check?.status ?? "unverified") !== "match") {
        const suggestion = check?.suggested_name
          ? ` Did you mean "${check.suggested_name}"?`
          : "";
        return {
          error: `That school name/locality doesn't match the ACARA schools registry, so it can't be saved.${suggestion}`,
        };
      }
    }

    // ABN gate — must still match the ABR entity name.
    let abnEntity: string | null | undefined;
    if (abnOrNameChanged) {
      const res = await lookupAbn(abn);
      if (!res.ok) {
        return { error: "That ABN couldn't be verified with the ABR — check the number." };
      }
      if (!namesMatch(school, res.entityName, res.businessNames)) {
        return {
          error: `The ABN is registered to "${res.entityName}", which doesn't match this school name — it can't be saved.`,
        };
      }
      abnEntity = res.entityName;
    }

    const emailErr = await changeEmail();
    if (emailErr) return { error: emailErr };

    const update: Record<string, unknown> = {
      school, suburb: suburb || null, postcode: postcode || null,
      contact_phone: phone || null,
      abn,
      address: address || null,
    };
    // Saving the profile counts as the school confirming its delivery address.
    if (DELIVERY_CONFIRM_READY) update.delivery_confirmed = true;
    if (abnOrNameChanged) {
      update.abn_verified = true;
      update.abn_entity_name = abnEntity;
    }
    if (email && email !== user.email) update.contact_email = email;
    const { error } = await supabase.from("schools").update(update).eq("id", user.id);
    if (error) return { error: error.message };
  } else {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Name can't be empty." };
    const emailErr = await changeEmail();
    if (emailErr) return { error: emailErr };
    const { error } = await supabase
      .from("donors")
      .update({ name, contact_phone: phone || null })
      .eq("id", user.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { ok: true, emailPending };
}
