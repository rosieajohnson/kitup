"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function SignInPage() {
  // useSearchParams must sit under a Suspense boundary (Next 15).
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const confirmExpired = params.get("confirm") === "expired";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      setError(
        "Sign-in needs Supabase connected. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
      );
      return;
    }

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    setLoading(true);
    const supabase = createClient();
    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      const notConfirmed =
        signInError?.code === "email_not_confirmed" ||
        (signInError?.message ?? "").toLowerCase().includes("not confirmed");
      setError(
        notConfirmed
          ? "Please verify your email first — check your inbox for the confirmation link."
          : (signInError?.message ?? "Could not sign in."),
      );
      setLoading(false);
      return;
    }

    // Role is an account property (set at sign-up). Route by it.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    router.push(profile?.role === "school" ? "/dashboard" : "/");
    router.refresh();
  }

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <h1 className="text-center font-display text-3xl font-bold tracking-tight text-ink">
          Welcome back
        </h1>
        <p className="mt-2 text-center text-ink-soft">
          Sign in to manage your school&apos;s campaigns — or to keep funding.
        </p>

        {confirmExpired && (
          <p
            role="status"
            className="mt-6 rounded-lg bg-sun/15 px-4 py-3 text-center text-sm font-medium text-ink"
          >
            That confirmation link has expired or was already used. Sign in
            below — if your email still isn&apos;t verified, we&apos;ll offer to
            resend the link.
          </p>
        )}

        <form
          className="mt-8 space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card"
          onSubmit={onSubmit}
        >
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
          <div className="-mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-coral hover:text-coral-dark"
            >
              Forgot password?
            </Link>
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
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-ink-soft">
            New here?{" "}
            <Link
              href="/sign-up"
              className="font-semibold text-coral hover:text-coral-dark"
            >
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  placeholder,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
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
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
      />
    </div>
  );
}
