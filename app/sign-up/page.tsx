"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, HandHeart, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { validatePassword } from "@/lib/password";
import { PasswordChecklist } from "@/components/password-checklist";
import { normalizeAbn, isValidAbn } from "@/lib/abn";
import {
  verifySchoolAbn,
  precheckSchool,
  geocodeSchoolAddress,
  sendWelcomeEmail,
} from "@/app/sign-up/actions";

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
    return "Your password needs at least 6 characters, a capital letter, a number and a symbol.";
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
  // Kit Up is school-first, so default to a school account unless the link
  // explicitly asks for a donor (e.g. ?role=donor).
  const [role, setRole] = useState<Role>(
    params.get("role") === "donor" ? "donor" : "school",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [password, setPassword] = useState("");
  // School name is controlled so ACARA suggestions can fill it in on a
  // mismatch (see precheckSchool).
  const [schoolName, setSchoolName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Schools must accept the ASF grant agreement (school <-> ASF) at sign-up.
  const [agreedGrant, setAgreedGrant] = useState(false);
  // Everyone must confirm they're 18+; schools must also confirm they're
  // authorised to act for the school.
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [authorisedForSchool, setAuthorisedForSchool] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuggestions([]);

    if (!isSupabaseConfigured()) {
      setError(
        "Account creation needs Supabase connected. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
      );
      return;
    }

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    // Validate up front (mirrors the DB constraints) so we can name the
    // exact problem instead of surfacing a generic database error.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(
        "That doesn't look like a valid email address — check for a missing @ or dot.",
      );
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    // Age gate applies to every account (donor or school).
    if (!confirmedAge) {
      setError("Please confirm that you are 18 years or older.");
      return;
    }
    const nowISO = new Date().toISOString();

    // Role-specific metadata is read by the handle_new_user() trigger
    // (migration 0004) to provision the profiles + schools/donors rows.
    let metadata: Record<string, string>;
    if (role === "school") {
      const school = schoolName.trim();
      const suburb = String(form.get("suburb") ?? "").trim();
      const postcode = String(form.get("postcode") ?? "").trim();
      const abn = normalizeAbn(String(form.get("abn") ?? ""));
      const position = String(form.get("position") ?? "").trim();
      const phone = String(form.get("phone") ?? "").trim();
      if (!school) {
        setError("Please enter your school's name.");
        return;
      }
      if (!isValidAbn(abn)) {
        setError(
          "Enter a valid 11-digit ABN — double-check the number (it failed the ABN checksum).",
        );
        return;
      }
      if (!/^[0-9]{4}$/.test(postcode)) {
        setError(
          "Enter your 4-digit postcode — it's checked against the ACARA schools registry.",
        );
        return;
      }
      if (!position) {
        setError(
          "Please enter your position at the school (e.g. Principal, Treasurer).",
        );
        return;
      }
      if (phone.replace(/[^0-9]/g, "").length < 8) {
        setError("Please enter a valid contact phone number for your school.");
        return;
      }
      if (!authorisedForSchool) {
        setError(
          "Please confirm you're authorised to act on behalf of your school.",
        );
        return;
      }
      if (!agreedGrant) {
        setError(
          "Please agree to the Grant Agreement with the Australian Sports Foundation to create a school account.",
        );
        return;
      }
      metadata = {
        role,
        school,
        suburb,
        postcode,
        abn,
        position,
        phone,
        authorised: "true",
        authorised_at: nowISO,
        grant_accepted_at: nowISO,
        age_confirmed_at: nowISO,
      };

      // Verify the school against ACARA (name + postcode) and the ABN against
      // the ABR BEFORE creating the account — so a wrong postcode/name/ABN is
      // caught upfront instead of creating an unverified account.
      setLoading(true);
      const pre = await precheckSchool({ school, suburb, postcode, abn });
      if (pre.error) {
        setError(pre.error);
        setSuggestions(pre.suggestions ?? []);
        setLoading(false);
        return;
      }
    } else {
      const name = String(form.get("name") ?? "").trim();
      if (!name) {
        setError("Please enter your name.");
        return;
      }
      metadata = { role, name, age_confirmed_at: nowISO };
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        // Where the confirmation-email link returns to (exchanged by
        // /auth/callback, then on to the app).
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (signUpError) {
      setError(friendlySignUpError(signUpError));
      setLoading(false);
      return;
    }

    // Advisory ABN check against the ABR — best-effort, must never block or
    // delay the sign-up. Persists abn_verified server-side for admin review.
    if (role === "school" && data.user) {
      void verifySchoolAbn(data.user.id).catch(() => {});
      // Fill a delivery street address from ACARA coordinates (best-effort).
      void geocodeSchoolAddress(data.user.id).catch(() => {});
    }
    // Welcome email from Kit Up (best-effort, both roles).
    if (data.user) {
      void sendWelcomeEmail(data.user.id).catch(() => {});
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
          List the sports kit your school needs — or sign up as a donor to back
          a local school.
        </p>

        <div
          role="tablist"
          aria-label="Account type"
          className="mt-8 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1"
        >
          <RoleTab
            active={role === "school"}
            onClick={() => setRole("school")}
            icon={<GraduationCap className="h-4 w-4" aria-hidden />}
            label="School"
          />
          <RoleTab
            active={role === "donor"}
            onClick={() => setRole("donor")}
            icon={<HandHeart className="h-4 w-4" aria-hidden />}
            label="Donor"
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
              <div>
                <Field
                  id="school"
                  label="School name"
                  type="text"
                  autoComplete="organization"
                  required
                  placeholder="Brunswick East Primary School"
                  value={schoolName}
                  onChange={(e) => {
                    setSchoolName(e.target.value);
                    if (suggestions.length) setSuggestions([]);
                  }}
                />
                {suggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1.5 text-xs font-medium text-ink-soft">
                      Did you mean:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setSchoolName(s);
                            setSuggestions([]);
                            setError(null);
                          }}
                          className="rounded-full border border-line-strong bg-canvas px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-coral hover:bg-coral/10 hover:text-coral-dark"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                  required
                  placeholder="3057"
                />
              </div>
              <Field
                id="abn"
                label="ABN"
                type="text"
                inputMode="numeric"
                required
                placeholder="e.g. 30 981 085 746"
              />
              <Field
                id="position"
                label="Your position at the school"
                type="text"
                autoComplete="organization-title"
                required
                placeholder="e.g. Principal, Treasurer, Sports Coordinator"
              />
              <Field
                id="phone"
                label="Contact phone number"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                placeholder="e.g. (03) 9123 4567"
              />
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
          <div>
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordChecklist password={password} className="mt-2" />
          </div>

          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={confirmedAge}
              onChange={(e) => setConfirmedAge(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
            />
            <span>I confirm I am 18 years of age or older.</span>
          </label>

          {role === "school" && (
            <>
              <label className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={authorisedForSchool}
                  onChange={(e) => setAuthorisedForSchool(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
                />
                <span>
                  I confirm I am authorised to act on behalf of this school.
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={agreedGrant}
                  onChange={(e) => setAgreedGrant(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
                />
                <span>
                  I have read and agree, on behalf of my school, to the{" "}
                  <a
                    href="/grant-agreement"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-coral underline hover:text-coral-dark"
                  >
                    Grant Agreement
                  </a>{" "}
                  with the Australian Sports Foundation.
                </span>
              </label>
            </>
          )}

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
            We verify your school against the public schools registry and your
            ABN against the Australian Business Register — suburb and postcode
            make the match more accurate.
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
  value,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  inputMode?: "numeric" | "text" | "email" | "tel";
  pattern?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
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
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
      />
    </div>
  );
}
