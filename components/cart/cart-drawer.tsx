"use client";

import { useEffect, useState, useTransition } from "react";
import {
  X,
  Minus,
  Plus,
  Trash2,
  Loader2,
  ShoppingCart,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, moneyExact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/cart/cart-context";
import { computeFees, feeCopy, feePct } from "@/lib/fees";
import {
  createCheckoutSession,
  lookupDonorEmail,
  type GuestInput,
} from "@/app/cart/actions";
import { validatePassword } from "@/lib/password";
import { PasswordChecklist } from "@/components/password-checklist";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
type EmailStatus = "idle" | "checking" | "new" | "existing";

export function CartDrawer() {
  const {
    lines,
    total,
    isOpen,
    close,
    setQuantity,
    removeLine,
    checkoutEnabled,
    signedInDonor,
  } = useCart();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Guest checkout details (only used when not signed in).
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createAccount, setCreateAccount] = useState(true);
  const [password, setPassword] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [anonymous, setAnonymous] = useState(false);
  // Optional donor business + postcode (for the ASF donor records).
  const [business, setBusiness] = useState("");
  const [postcode, setPostcode] = useState("");
  // Fundraising-costs fee (shown only here at checkout; donor can opt out).
  const [coverCosts, setCoverCosts] = useState(true);
  const [feeOpen, setFeeOpen] = useState(false);
  // Donors must agree to the (ASF) donation terms before paying.
  const [agreedTerms, setAgreedTerms] = useState(false);

  const fee = computeFees(total);
  const grandTotal = total + (coverCosts ? fee.total : 0);
  const schoolNames = Array.from(
    new Set(lines.map((l) => l.schoolName).filter(Boolean)),
  ) as string[];
  const schoolLabel =
    schoolNames.length === 1 ? schoolNames[0] : "the schools you're supporting";
  const copy = feeCopy(schoolLabel);

  // Live-check whether the entered email already has an account.
  useEffect(() => {
    if (signedInDonor) return;
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setEmailStatus("idle");
      return;
    }
    setEmailStatus("checking");
    const t = setTimeout(async () => {
      const { exists } = await lookupDonorEmail(e);
      setEmailStatus(exists ? "existing" : "new");
    }, 500);
    return () => clearTimeout(t);
  }, [email, signedInDonor]);

  // Group lines by campaign for display.
  const groups = lines.reduce<Record<string, typeof lines>>((acc, l) => {
    (acc[l.campaignTitle] ??= []).push(l);
    return acc;
  }, {});

  function pay() {
    setError(null);

    let guest: GuestInput | undefined;
    if (!signedInDonor) {
      if (!name.trim() || !EMAIL_RE.test(email.trim())) {
        setError("Enter your name and a valid email to donate.");
        return;
      }
      // Only offer account creation when the email is new.
      const wantAccount = emailStatus === "new" && createAccount;
      if (wantAccount) {
        const pwError = validatePassword(password);
        if (pwError) {
          setError(pwError + " Or untick 'Create an account'.");
          return;
        }
      }
      guest = {
        name: name.trim(),
        email: email.trim(),
        password,
        createAccount: wantAccount,
      };
    }

    if (!agreedTerms) {
      setError("Please agree to the Terms & Conditions to donate.");
      return;
    }

    startTransition(async () => {
      const result = await createCheckoutSession(
        lines.map((l) => ({
          itemId: l.itemId,
          campaignId: l.campaignId,
          quantity: l.quantity,
        })),
        guest,
        anonymous,
        coverCosts,
        agreedTerms,
        business.trim(),
        postcode.trim(),
      );
      if (result.error) setError(result.error);
      else if (result.url) window.location.href = result.url;
    });
  }

  return (
    <>
      {/* Scrim */}
      <div
        onClick={close}
        aria-hidden
        className={cn(
          "fixed inset-0 z-50 bg-ink/40 transition-opacity",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Your cart"
        aria-modal="true"
        className={cn(
          "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col bg-canvas shadow-2xl transition-transform",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">Your cart</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface-sunk"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingCart className="h-10 w-10 text-ink-faint" aria-hidden />
            <p className="text-ink-soft">Your cart is empty.</p>
            <p className="text-sm text-ink-faint">
              Add items from a campaign to fund them together.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {Object.entries(groups).map(([campaignTitle, group]) => (
              <div key={campaignTitle} className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {campaignTitle}
                </p>
                <ul className="space-y-3">
                  {group.map((l) => (
                    <li
                      key={l.itemId}
                      className="rounded-xl border border-line bg-surface p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-medium text-ink">
                          {l.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeLine(l.itemId)}
                          aria-label={`Remove ${l.title}`}
                          className="text-ink-faint hover:text-coral"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-full border border-line-strong bg-canvas">
                          <button
                            type="button"
                            aria-label="One fewer"
                            onClick={() =>
                              setQuantity(l.itemId, l.quantity - 1)
                            }
                            className="grid h-8 w-8 place-items-center rounded-full text-ink hover:bg-surface-sunk"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <span className="w-7 text-center text-sm font-bold tabular-nums">
                            {l.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="One more"
                            onClick={() =>
                              setQuantity(l.itemId, l.quantity + 1)
                            }
                            disabled={l.quantity >= l.maxQuantity}
                            className="grid h-8 w-8 place-items-center rounded-full text-ink hover:bg-surface-sunk disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <span className="text-sm font-semibold text-ink tabular-nums">
                          {moneyExact(l.unitCost * l.quantity)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <footer className="border-t border-line px-5 py-4">
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">Donation</span>
                <span className="tabular-nums text-ink">{money(total)}</span>
              </div>

              {/* Help cover our fundraising costs — expandable breakdown */}
              <div>
                <button
                  type="button"
                  onClick={() => setFeeOpen((o) => !o)}
                  aria-expanded={feeOpen}
                  className="flex w-full items-center justify-between text-sm"
                >
                  <span className="inline-flex items-center gap-1 text-ink-soft">
                    Help cover our fundraising costs
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        feeOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      coverCosts ? "text-ink" : "text-ink-faint line-through",
                    )}
                  >
                    {coverCosts ? `+${moneyExact(fee.total)}` : moneyExact(0)}
                  </span>
                </button>

                {feeOpen && (
                  <div className="mt-2 space-y-3 rounded-lg border border-line bg-surface p-3 text-xs">
                    <div>
                      <div className="flex items-baseline justify-between font-medium text-ink">
                        <span>
                          {copy.platformCosts.label} ({feePct(copy.platformCosts.rate)})
                        </span>
                        <span className="tabular-nums">
                          {moneyExact(fee.platformCosts)}
                        </span>
                      </div>
                      <p className="mt-0.5 leading-relaxed text-ink-soft">
                        {copy.platformCosts.description}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between font-medium text-ink">
                        <span>
                          {copy.processing.label} ({feePct(copy.processing.rate)})
                        </span>
                        <span className="tabular-nums">
                          {moneyExact(fee.processing)}
                        </span>
                      </div>
                      <p className="mt-0.5 leading-relaxed text-ink-soft">
                        {copy.processing.description}
                      </p>
                    </div>
                    <label className="flex items-start gap-2 border-t border-line pt-2 text-ink-soft">
                      <input
                        type="checkbox"
                        checked={!coverCosts}
                        onChange={(e) => setCoverCosts(!e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
                      />
                      I&apos;d prefer not to contribute to these costs — put 100%
                      of my donation toward the items.
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-line pt-2">
                <span className="text-sm font-semibold text-ink">Total</span>
                <span className="font-display text-xl font-bold text-ink tabular-nums">
                  {money(grandTotal)}
                </span>
              </div>
            </div>
            {!checkoutEnabled && (
              <p className="mb-2 text-xs text-ink-faint">
                Payments aren&apos;t configured in this environment.
              </p>
            )}

            {!signedInDonor && (
              <div className="mb-3 space-y-2 rounded-lg border border-line bg-canvas p-3">
                <p className="text-xs font-semibold text-ink">
                  Your details{" "}
                  <span className="font-normal text-ink-faint">
                    (for your receipt)
                  </span>
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                {emailStatus === "checking" && (
                  <p className="text-xs text-ink-faint">Checking…</p>
                )}
                {emailStatus === "existing" && (
                  <p className="inline-flex items-start gap-1.5 text-xs font-medium text-turf-dark">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    Welcome back — we recognise this email, so your donation
                    will be linked to your account.
                  </p>
                )}
                {emailStatus === "new" && (
                  <>
                    <label className="flex items-start gap-2 text-xs text-ink-soft">
                      <input
                        type="checkbox"
                        checked={createAccount}
                        onChange={(e) => setCreateAccount(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
                      />
                      We noticed you&apos;re new — create an account to track
                      your donations and receipts. (Untick to donate as a
                      guest.)
                    </label>
                    {createAccount && (
                      <>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Create a password"
                          autoComplete="new-password"
                          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                        />
                        <PasswordChecklist password={password} className="mt-1.5" />
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mb-3 space-y-2 rounded-lg border border-line bg-canvas p-3">
              <p className="text-xs font-semibold text-ink">
                Business &amp; postcode{" "}
                <span className="font-normal text-ink-faint">(optional)</span>
              </p>
              <input
                type="text"
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                placeholder="Business or organisation (optional)"
                autoComplete="organization"
                maxLength={200}
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Postcode (optional)"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={20}
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
            </div>

            <label className="mb-3 flex items-start gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
              />
              Make my donation anonymous — show my name as &quot;Anonymous&quot;
              to the public.
            </label>

            <div className="mb-3 rounded-lg border border-line bg-surface p-3 text-xs text-ink-soft">
              <p className="mb-2">
                Through our partnership with the Australian Sports Foundation,
                any donation of $2 or more is tax deductible.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line-strong text-coral focus:ring-coral/30"
                />
                <span>
                  By donating today, your donation is made unconditionally to the
                  Australian Sports Foundation (ASF) and you agree to the ASF{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-coral underline hover:text-coral-dark"
                  >
                    Terms &amp; Conditions
                  </a>{" "}
                  and the ASF{" "}
                  <a
                    href="https://asf.org.au/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-coral underline hover:text-coral-dark"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={pay}
              disabled={pending || !checkoutEnabled}
            >
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {pending ? "Redirecting…" : `Pay ${money(grandTotal)}`}
            </Button>
            {error && (
              <p
                role="alert"
                className="mt-2 text-sm font-medium text-coral-dark"
              >
                {error}
              </p>
            )}
          </footer>
        )}
      </aside>
    </>
  );
}
