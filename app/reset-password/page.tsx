"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // The /auth/callback handler established a session before sending us
  // here — confirm it's there before showing the form.
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setValid(Boolean(data.user));
      setReady(true);
    });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1500);
  }

  const cardWrap =
    "container-page flex min-h-[70vh] items-center justify-center py-12";

  if (!ready) {
    return (
      <div className={cardWrap}>
        <Loader2 className="h-6 w-6 animate-spin text-ink-faint" aria-hidden />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className={cardWrap}>
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-card">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            This reset link isn&apos;t valid
          </h1>
          <p className="mt-2 text-ink-soft">
            It may have expired or already been used. Request a fresh one.
          </p>
          <div className="mt-6">
            <Link href="/forgot-password">
              <Button size="lg" className="w-full">
                Send a new reset link
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardWrap}>
      <div className="w-full max-w-md">
        <h1 className="text-center font-display text-3xl font-bold tracking-tight text-ink">
          Set a new password
        </h1>

        {done ? (
          <p className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface p-6 text-sm font-semibold text-turf-dark shadow-card">
            <Check className="h-4 w-4" aria-hidden /> Password updated —
            redirecting…
          </p>
        ) : (
          <form
            className="mt-8 space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card"
            onSubmit={onSubmit}
          >
            <Field
              id="password"
              label="New password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
            />
            <Field
              id="confirm"
              label="Confirm new password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
            />

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral-dark"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-semibold text-ink"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        required
        minLength={6}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
      />
    </div>
  );
}
