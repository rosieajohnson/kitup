import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the one-time code from an email link (password reset, etc.)
 * for a session, then forwards to `next`. Used by the recovery flow:
 * the reset email points here, and we land the user on /reset-password
 * with a valid session so they can set a new password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error(
      "auth/callback exchangeCodeForSession failed:",
      error.status,
      error.code,
      error.message,
    );
  } else {
    console.error("auth/callback: no code param; query was", request.url);
  }

  // No code, or the link was already expired/consumed (e.g. an email
  // security scanner pre-opened it). Route by flow: recovery links go back to
  // request a fresh reset; anything else (e.g. a signup confirm) goes to
  // sign-in — never dump a signup on the password-reset page.
  const dest = next.includes("reset-password")
    ? "/forgot-password?expired=1"
    : "/sign-in?confirm=expired";
  return NextResponse.redirect(`${origin}${dest}`);
}
