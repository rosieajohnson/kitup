"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Send a password-reset email OURSELVES (via Resend) instead of relying on the
 * Supabase "Reset Password" email template. We mint the recovery token with the
 * admin API (no email sent by Supabase), then email a link to our own
 * /auth/confirm click-to-continue page — which survives corporate mail scanners
 * (Mimecast/Safe Links) that pre-fetch links.
 *
 * Always returns ok (even for unknown emails) to avoid revealing which
 * addresses have accounts.
 */
export async function requestPasswordReset(
  email: string,
  origin: string,
): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const base = origin?.startsWith("http") ? origin : "http://localhost:3000";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: clean,
    });

    // Unknown email (or any error): pretend success, send nothing.
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) return { ok: true };

    const link = `${base}/auth/confirm?token_hash=${tokenHash}&type=recovery&next=/reset-password`;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("requestPasswordReset: RESEND_API_KEY not set — no email sent");
      return { ok: true };
    }
    const from =
      process.env.CONTACT_FROM_EMAIL || "Kit Up <onboarding@resend.dev>";

    const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f2;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #dde4d8;border-radius:16px;overflow:hidden;">
      <tr><td style="background:#15241c;padding:20px 32px;"><span style="font-size:20px;font-weight:800;color:#fff;">Kit&nbsp;Up</span></td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#15241c;">Reset your password</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4c5a52;">Click the button below to choose a new password. This link expires in one hour.</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:9999px;background:#ff5a3c;">
          <a href="${link}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;border-radius:9999px;">Reset my password</a>
        </td></tr></table>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#7c887f;">If you didn't request this, you can ignore this email — your password won't change.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
    const text = `Reset your Kit Up password.\n\nClick to choose a new password (expires in 1 hour):\n${link}\n\nIf you didn't request this, ignore this email.`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [clean],
        subject: "Reset your Kit Up password",
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error("requestPasswordReset: Resend failed", res.status, await res.text());
    }
    return { ok: true };
  } catch (err) {
    console.error("requestPasswordReset error", err);
    return { ok: true }; // never leak account existence
  }
}
