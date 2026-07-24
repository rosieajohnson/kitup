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
