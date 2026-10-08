import type { Metadata } from "next";
import { PRIVACY_HTML } from "@/lib/privacy-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Kit Up collects, uses, holds, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          How Kit Up collects, uses, holds, and protects your personal
          information.
        </p>

        <div className="mt-6 rounded-xl border border-line bg-surface-sunk/60 p-4 text-sm leading-relaxed text-ink-soft">
          <p className="font-semibold text-ink">Which privacy policy applies?</p>
          <p className="mt-1">
            This policy covers your use of the Kit Up website and your account.
            Donations are processed by our charity partner, the{" "}
            <strong>Australian Sports Foundation (ASF)</strong>, who receives the
            donation and issues your tax-deductible receipt — the ASF handles the
            personal information involved in a donation under its own{" "}
            <a
              href="https://asf.org.au/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-coral underline hover:text-coral-dark"
            >
              Privacy Policy
            </a>
            . You agree to the ASF&apos;s terms and privacy policy at checkout
            when you donate.
          </p>
        </div>

        <div
          className="legal mt-8"
          dangerouslySetInnerHTML={{ __html: PRIVACY_HTML }}
        />
      </div>
      <style>{`
        .legal ol { list-style: none; margin: 0; padding: 0; }
        .legal ol li { font-family: var(--font-display); font-weight: 700; color: var(--color-ink); margin-top: 1.75rem; margin-bottom: .4rem; font-size: 1.15rem; line-height: 1.3; }
        .legal ol li ol { margin-top: .4rem; }
        .legal ol li ol li { font-size: 1rem; margin-top: 1rem; }
        .legal p { margin: .75rem 0; line-height: 1.75; color: var(--color-ink-soft); }
        .legal ul { list-style: disc; padding-left: 1.25rem; margin: .5rem 0 1rem; }
        .legal ul li { margin: .3rem 0; line-height: 1.7; color: var(--color-ink-soft); }
        .legal strong { color: var(--color-ink); }
        .legal a { color: var(--color-coral); text-decoration: underline; }
      `}</style>
    </div>
  );
}
