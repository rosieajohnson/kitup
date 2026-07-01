import type { Metadata } from "next";
import { GraduationCap, HandHeart } from "lucide-react";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Kit Up team.",
};

export default function ContactPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Contact us
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          Questions about funding a campaign, getting your school verified, or
          anything else? Send us a message and we&apos;ll reply by email.
        </p>

        <div className="mt-8">
          <ContactForm />
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface p-6">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-coral-tint text-coral-dark">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-bold text-ink">For schools</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Help getting verified, building a campaign, or receiving your
              gear once it&apos;s funded.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-6">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-coral-tint text-coral-dark">
              <HandHeart className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-bold text-ink">For donors</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Questions about a payment, a campaign you funded, or how your
              money is used.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
