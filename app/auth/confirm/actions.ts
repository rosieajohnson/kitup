"use server";

import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Verify an email one-time token — invoked by the click-to-continue button on
 * /auth/confirm, i.e. on POST (a human action), NOT on GET. Email security
 * scanners (Mimecast, Microsoft Safe Links, etc.) pre-fetch links with GET,
 * which would consume a single-use token; requiring a button click means only
 * the real user's action verifies it, so the token survives the scan.
 */
export async function confirmOtp(formData: FormData): Promise<void> {
  const token_hash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const nextRaw = String(formData.get("next") ?? "/");
  // Only allow same-app relative redirects.
  const next = nextRaw.startsWith("/") ? nextRaw : "/";

  let ok = false;
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    ok = !error;
    if (error) {
      console.error(
        "confirmOtp verifyOtp failed:",
        error.status,
        error.code,
        error.message,
      );
    }
  }

  if (ok) redirect(next);
  redirect(
    type === "recovery"
      ? "/forgot-password?expired=1"
      : "/sign-in?confirm=expired",
  );
}
