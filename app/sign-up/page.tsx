"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, HandHeart, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Role = "donor" | "school";

/** Turn a Supabase sign-up error into a clear, specific message. */
function friendlySignUpError(err: { message?: string; code?: string }): string {
  const msg = (err.message ?? "").toLowerCase();
  const code = err.code ?? "";
  if (
    code === "user_already_exists" ||
    msg.includes("already registered") ||
    msg.includes("already been registered")
  ) {
    return "An account with this email already exists — try signing in instead.";
  }
  if (code === "weak_password" || msg.includes("password")) {
    return "Password must be at least 6 characters.";
  }
  if (
    !err.message ||
    msg.includes("database error") ||
    msg.includes("unexpected")
  ) {
    return "We couldn't create the account — please double-check your email and postcode, then try again.";
  }
  return err.message ?? "Could not create your account.";
}

export default function SignUpPage() {
  // useSearchParams must sit under a Suspense boundary (Next 15).
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role>(
    params.get("role") === "school" ? "school" : "donor",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      setError(
        "Account creation needs Supabase connected. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
      );
      return;
    }

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    // Validate up front (mirrors the DB constraints) so we can name the
    // exact problem instead of surfacing a generic database error.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(
        "That doesn't look like a valid email address — check for a missing @ or dot.",
      );
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    // Role-specific metadata is read by the handle_new_user() trigger
    // (migration 0004) to provision the profiles + schools/donors rows.
    let metadata: Record<string, string>;
    if (role === "school") {
      const school = String(form.get("school") ?? "").trim();
      const suburb = String(form.get("suburb") ?? "").trim();
      const postcode = String(form.get("postcode") ?? "").trim();
      if (!school) {
        setError("Please enter your school's name.");
        return;
      }
      if (postcode && !/^[0-9]{4}$/.test(postcode)) {
        setError("Postcode must be 4 digits (e.g. 3057), or left blank.");
        return;
      }
      metadata = { role, school, suburb, postcode };
    } else {
      const name = String(form.get("name") ?? "").trim();
      if (!name) {
        setError("Please enter your name.");
        return;
      }
      metadata = { role, name };
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });

    if (signUpError) {
      setError(friendlySignUpError(signUpError));
      setLoading(false);
      return;
    }

    // With email confirmation on (Supabase default) there is no session
    // yet — tell the user to confirm. If it's disabled, route them in.
    if (data.session) {
      router.push(role === "school" ? "/dashboard" : "/");
      router.refresh();
      return;
    }
    setEmailSent(true);
    setLoading(false);
  }

  if (emailSent) {
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
            We&apos;ve sent a confirmation link to finish setting up your
            account. Once you confirm, sign in to get started.
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
          Create your account
        </h1>
        <p className="mt-2 text-center text-ink-soft">
          Fund the gear local schools need, or list what your school needs.
        </p>

        <div
          role="tablist"
          aria-label="Account type"
          className="mt-8 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1"
        >
          <RoleTab
            active={role === "donor"}
            onClick={() => setRole("donor")}
            icon={<HandHeart className="h-4 w-4" aria-hidden />}
            label="Donor"
          />
          <RoleTab
            active={role === "school"}
            onClick={() => setRole("school")}
            icon={<GraduationCap className="h-4 w-4" aria-hidden />}
            label="School"
          />
        </div>

        <form
          className="mt-6 space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card"
          onSubmit={onSubmit}
        >
          {role === "donor" ? (
            <Field
              id="name"
              label="Your name"
              type="text"
              autoComplete="name"
              required
              placeholder="Alex Donor"
            />
          ) : (
            <>
              <Field
                id="school"
                label="School name"
                type="text"
                autoComplete="organization"
                required
                placeholder="Brunswick East Primary School"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="suburb"
                  label="Suburb"
                  type="text"
                  placeholder="Brunswick East"
                />
                <Field
                  id="postcode"
                  label="Postcode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  placeholder="3057"
                />
              </div>
            </>
          )}

          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            placeholder={
              role === "school" ? "sport@yourschool.edu.au" : "you@email.com"
            }
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="At least 6 characters"
          />

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
            {loading
              ? "Creating account…"
              : `Create ${role === "school" ? "a school" : "a donor"} account`}
          </Button>
          <p className="text-center text-sm text-ink-soft">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-semibold text-coral hover:text-coral-dark"
            >
              Sign in
            </Link>
          </p>
        </form>

        {role === "school" && (
          <p className="mt-4 text-center text-xs text-ink-faint">
            We verify your school name against the public schools registry —
            suburb and postcode make the match more accurate.
          </p>
        )}
      </div>
    </div>
  );
}

function RoleTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-colors",
        active ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({
  id,
  label,
  type,
  placeholder,
  autoComplete,
  required,
  minLength,
  inputMode,
  pattern,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  inputMode?: "numeric" | "text" | "email";
  pattern?: string;
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
        minLength={minLength}
        inputMode={inputMode}
        pattern={pattern}
        className="w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
      />
    </div>
  );
}
