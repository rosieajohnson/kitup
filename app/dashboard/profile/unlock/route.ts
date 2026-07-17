import { NextResponse, type NextRequest } from "next/server";
import {
  verifyUnlockToken,
  PROFILE_EDIT_READY,
  UNLOCK_WINDOW_MS,
} from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { originFromHeaders } from "@/lib/http";

/**
 * Email-link target that opens the profile-edit window. The token is HMAC-
 * signed and carries the user id, so control of the inbox proves identity;
 * we then set edit_unlocked_until for that user. They still have to be signed
 * in as that account to actually edit (the profile page requires auth).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = originFromHeaders(req.headers);
  if (!PROFILE_EDIT_READY) {
    return NextResponse.redirect(`${origin}/dashboard/profile`);
  }
  const userId = verifyUnlockToken(searchParams.get("t") ?? "");
  if (!userId) {
    return NextResponse.redirect(`${origin}/dashboard/profile?unlock=invalid`);
  }
  const until = new Date(Date.now() + UNLOCK_WINDOW_MS).toISOString();
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ edit_unlocked_until: until })
    .eq("id", userId);
  if (error) {
    console.error("profile unlock failed:", error.message);
    return NextResponse.redirect(`${origin}/dashboard/profile?unlock=error`);
  }
  return NextResponse.redirect(`${origin}/dashboard/profile?unlock=ok`);
}
