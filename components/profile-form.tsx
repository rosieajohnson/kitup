"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestEditUnlock, updateProfile } from "@/app/dashboard/profile/actions";

type Role = "school" | "donor";

const inputCls =
  "w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30 disabled:opacity-60";

export function ProfileForm({
  role,
  email,
  initial,
  unlocked,
  flash,
}: {
  role: Role;
  email: string;
  initial: Record<string, string>;
  unlocked: boolean;
  flash: string | null;
}) {
  const [pending, start] = useTransition();
  const [sentUnlock, setSentUnlock] = useState(false);
  const [error, setError] = useState<string | null>(
    flash === "invalid" ? "That unlock link was invalid or has expired." : null,
  );
  const [saved, setSaved] = useState(false);
  const [emailPending, setEmailPending] = useState(false);

  function requestUnlock() {
    setError(null);
    start(async () => {
      const r = await requestEditUnlock();
      if (r.error) setError(r.error);
      else setSentUnlock(true);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateProfile(fd);
      if (r.error) setError(r.error);
      else {
        setSaved(true);
        setEmailPending(Boolean(r.emailPending));
      }
    });
  }

  const label = "mb-1.5 block text-sm font-semibold text-ink";
  const field = (
    id: string,
    text: string,
    opts: { type?: string; placeholder?: string; defaultValue?: string } = {},
  ) => (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <input
        id={id}
        name={id}
        type={opts.type ?? "text"}
        defaultValue={opts.defaultValue}
        placeholder={opts.placeholder}
        disabled={!unlocked}
        className={inputCls}
      />
    </div>
  );

  if (!unlocked) {
    return (
      <div className="mt-6 rounded-xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" aria-hidden />
          <div>
            <h2 className="font-bold text-ink">Editing is locked</h2>
            <p className="mt-1 text-sm text-ink-soft">
              To change your details we first verify it&apos;s you. We&apos;ll
              email <span className="font-medium text-ink">{email}</span> a link
              that unlocks editing for 30 minutes.
            </p>
          </div>
        </div>
        {sentUnlock ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-turf/10 px-3 py-2 text-sm font-medium text-turf-dark">
            <MailCheck className="h-4 w-4" aria-hidden /> Check your email for the
            unlock link.
          </p>
        ) : (
          <Button className="mt-4" size="sm" disabled={pending} onClick={requestUnlock}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Email me a link to edit
          </Button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-coral-dark">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card"
    >
      <p className="inline-flex items-center gap-2 rounded-lg bg-turf/10 px-3 py-2 text-xs font-medium text-turf-dark">
        <ShieldCheck className="h-4 w-4" aria-hidden /> Verified — editing is
        unlocked.
      </p>

      {role === "school" ? (
        <>
          {field("school", "School name", { defaultValue: initial.school })}
          <div className="grid grid-cols-2 gap-3">
            {field("suburb", "Suburb", { defaultValue: initial.suburb })}
            {field("postcode", "Postcode", { defaultValue: initial.postcode })}
          </div>
          {field("abn", "ABN", { defaultValue: initial.abn })}
          <p className="-mt-2 text-xs text-ink-faint">
            Changing the school name re-checks it against the ACARA registry and
            your ABN — a mismatch will be rejected.
          </p>
          {field("address", "Delivery address", {
            placeholder: "e.g. 195A Stewart Street",
            defaultValue: initial.address,
          })}
          <p className="-mt-2 text-xs text-ink-faint">
            Where funded kit is delivered. We pre-fill this from your school&apos;s
            registered location — please check it&apos;s correct. Saving confirms it.
          </p>
        </>
      ) : (
        field("name", "Your name", { defaultValue: initial.name })
      )}

      {field("contact_phone", "Phone", {
        type: "tel",
        placeholder: "0412 345 678",
        defaultValue: initial.contact_phone,
      })}
      {field("email", "Email", { type: "email", defaultValue: email })}
      <p className="-mt-2 text-xs text-ink-faint">
        Changing your email sends a confirmation link to the new address — it
        takes effect once you confirm.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral-dark">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg bg-turf/10 px-3 py-2 text-sm font-medium text-turf-dark">
          Saved.{emailPending ? " Check your new email address to confirm the change." : ""}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
