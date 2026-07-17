"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupAbn, namesMatch } from "@/lib/abr";
import { normalizeAbn, isValidAbn } from "@/lib/abn";

/**
 * Pre-signup gate for school accounts: verify the school name + postcode
 * against the ACARA registry AND the ABN against the ABR *before* the account
 * is created, so the user is told upfront instead of ending up with an
 * unverified account. Runs with the service-role client (bypasses RLS to read
 * school_registry). Returns a specific error, or { ok: true }.
 */
export async function precheckSchool(input: {
  school: string;
  suburb: string;
  postcode: string;
  abn: string;
}): Promise<{ ok?: boolean; error?: string; suggestions?: string[] }> {
  const school = input.school.trim();
  const postcode = input.postcode.trim();
  const abn = normalizeAbn(input.abn);
  if (!school || !/^[0-9]{4}$/.test(postcode) || !isValidAbn(abn)) {
    return { error: "Check the school name, 4-digit postcode and ABN." };
  }

  const admin = createAdminClient();

  // ACARA: name must match a school at this exact postcode.
  const { data: check } = await admin.rpc("check_school_address", {
    p_school: school,
    p_address: null,
    p_suburb: input.suburb.trim() || null,
    p_postcode: postcode,
  });
  const status: string = check?.status ?? "unverified";
  if (status !== "match") {
    // Offer the ACARA-listed schools at that postcode so the user can pick.
    const { data: sugg } = await admin.rpc("suggest_school", {
      p_address: null,
      p_suburb: input.suburb.trim() || null,
      p_postcode: postcode,
      p_limit: 6,
    });
    const suggestions = Array.from(
      new Set(
        ((sugg as { suggested_name: string }[] | null) ?? [])
          .map((s) => s.suggested_name)
          .filter(Boolean),
      ),
    ).slice(0, 6);

    const msg =
      status === "mismatch"
        ? `"${school}" doesn't match a school at postcode ${postcode} in the ACARA registry.`
        : `No school found at postcode ${postcode} in the ACARA registry — check the school name and postcode.`;
    return {
      error:
        suggestions.length > 0
          ? `${msg} Pick the correct school from the list or check the postcode is correct.`
          : msg,
      suggestions,
    };
  }

  // ABR: ABN must be valid, active, and registered to a matching name.
  const res = await lookupAbn(abn);
  if (!res.ok) {
    return {
      error:
        "That ABN couldn't be verified with the Australian Business Register — check the number.",
    };
  }
  if (!namesMatch(school, res.entityName, res.businessNames)) {
    return {
      error: `That ABN is registered to "${res.entityName}", which doesn't match the school name.`,
    };
  }

  return { ok: true };
}

/**
 * Verify a newly-provisioned school's ABN against the ABR and persist the
 * result. Trusted: reads the school's own name + ABN from the DB (never from
 * the caller), computes the match server-side, and writes abn_verified. Safe
 * to call with any school id — it only ever runs an honest verification.
 *
 * Advisory: a failed/uncertain match leaves abn_verified = false for admin
 * review; it never blocks the account.
 */
export async function verifySchoolAbn(userId: string): Promise<{
  checked: boolean;
  verified: boolean;
  entityName: string | null;
  reason?: string;
}> {
  const admin = createAdminClient();

  const { data: school } = await admin
    .from("schools")
    .select("id, school, abn")
    .eq("id", userId)
    .maybeSingle();

  if (!school?.abn) {
    return { checked: false, verified: false, entityName: null, reason: "no_abn" };
  }

  const result = await lookupAbn(school.abn);
  if (!result.ok) {
    // No GUID configured yet, ABN not found, or ABR unreachable — leave
    // unverified (pending). Don't overwrite a prior verification.
    return {
      checked: false,
      verified: false,
      entityName: null,
      reason: result.reason,
    };
  }

  const active = (result.status ?? "").toLowerCase().includes("active");
  const verified =
    active && namesMatch(school.school, result.entityName, result.businessNames);

  await admin
    .from("schools")
    .update({ abn_verified: verified, abn_entity_name: result.entityName })
    .eq("id", userId);

  return {
    checked: true,
    verified,
    entityName: result.entityName,
    reason: verified ? undefined : "name_mismatch_or_inactive",
  };
}
