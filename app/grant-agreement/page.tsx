import type { Metadata } from "next";
import { GRANT_HTML } from "@/lib/grant-agreement-content";

export const metadata: Metadata = {
  title: "Grant Agreement",
  description:
    "The grant agreement between a school (Grant Recipient) and the Australian Sports Foundation.",
};

export default function GrantAgreementPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Grant Agreement
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          This agreement is between your school (the Grant Recipient) and the
          Australian Sports Foundation (ASF), which administers the grants funded
          through Kit Up. Schools agree to it when they sign up.
        </p>
        <div
          className="legal mt-8"
          dangerouslySetInnerHTML={{ __html: GRANT_HTML }}
        />
      </div>
      <style>{`
        .legal h2 { font-family: var(--font-display); font-weight: 700; color: var(--color-ink); margin-top: 2rem; margin-bottom: .5rem; font-size: 1.35rem; line-height: 1.25; }
        .legal h3 { font-family: var(--font-display); font-weight: 700; color: var(--color-ink); margin-top: 1.6rem; margin-bottom: .35rem; font-size: 1.1rem; line-height: 1.3; }
        .legal h4 { font-weight: 600; color: var(--color-ink); margin-top: 1.1rem; margin-bottom: .25rem; font-size: 1rem; }
        .legal p { margin: .6rem 0; line-height: 1.75; color: var(--color-ink-soft); }
        .legal ol { list-style: decimal; padding-left: 1.3rem; margin: .5rem 0 1rem; }
        .legal li { margin: .3rem 0; line-height: 1.7; color: var(--color-ink-soft); }
        .legal strong { color: var(--color-ink); }
        .legal a { color: var(--color-coral); text-decoration: underline; word-break: break-word; }
      `}</style>
    </div>
  );
}
