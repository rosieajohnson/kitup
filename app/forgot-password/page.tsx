"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const email = String(
      new FormData(e.currentTarget).get("email") ?? "",
    ).trim();
    if (!email) {
      setError("Enter your email.");
      return;
    }

    setLoading(true);
    // Server action: mints the recovery token and emails our own
    // /auth/confirm link via Resend (bypasses the Supabase email template).
    const result = await requestPasswordReset(email, window.location.origin);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // Always show success (don't reveal whether the email exists).
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-card">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-turf/15 text-turf-dark">
            <MailCheck className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            Check your email
          </h1>
          <p className="mt-2 text-ink-soft">
            If an account exists for that address, we&apos;ve sent a link to
            reset your password. The link expires after a short while.
          </p>
          <div className="mt-6">
            <Link href="/sign-in">
              <Button variant="outline" size="lg" className="w-full">
                Back to sign in
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <h1 className="text-center font-display text-3xl font-bold tracking-tight text-ink">
          Reset your password
        </h1>
        <p className="mt-2 text-center text-ink-soft">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>

        <form
          className="mt-8 space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card"
          onSubmit={onSubmit}
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@email.com"
              className="w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral-dark"
            >
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-ink-soft">
            Remembered it?{" "}
            <Link
              href="/sign-in"
              className="font-semibold text-coral hover:text-coral-dark"
            >
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
