import type { Metadata } from "next";
import { TERMS_HTML } from "@/lib/terms-content";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Donation terms and conditions for Kit Up, administered by the Australian Sports Foundation.",
};

export default function TermsPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          Donations through Kit Up are made to the Australian Sports Foundation
          (ASF), which issues your tax-deductible receipt. The following donation
          terms and conditions apply.
        </p>
        <div
          className="legal mt-8"
          dangerouslySetInnerHTML={{ __html: TERMS_HTML }}
        />
      </div>
      <style>{`
        .legal h3 { font-family: var(--font-display); font-weight: 700; color: var(--color-ink); margin-top: 1.75rem; margin-bottom: .4rem; font-size: 1.15rem; line-height: 1.3; }
        .legal p { margin: .75rem 0; line-height: 1.75; color: var(--color-ink-soft); }
        .legal ul { list-style: disc; padding-left: 1.25rem; margin: .5rem 0 1rem; }
        .legal li { margin: .3rem 0; line-height: 1.7; color: var(--color-ink-soft); }
        .legal strong { color: var(--color-ink); }
        .legal a { color: var(--color-coral); text-decoration: underline; }
        .legal table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .9rem; }
        .legal th, .legal td { border: 1px solid var(--color-line-strong); padding: .5rem .75rem; text-align: left; color: var(--color-ink-soft); }
        .legal th { background: var(--color-surface-sunk); color: var(--color-ink); font-weight: 600; }
      `}</style>
    </div>
  );
}
