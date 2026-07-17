import type { Metadata } from "next";
import { ShieldCheck, Tag, Lock, BadgeCheck, Receipt } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "Kit Up is crowdfunding that puts real sports kit in the hands of local Australian schools — one item at a time.",
};

export default function AboutPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          About Kit Up
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          Kit Up is a crowdfunding platform where Australian schools list the
          sports equipment they need and donors fund it, item by item.
        </p>
      </div>

      {/* Mission */}
      <section id="mission" className="mt-14 scroll-mt-24 max-w-2xl">
        <h2 className="font-display text-2xl font-bold text-ink">Our mission</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Every kid deserves to play. Too many public schools run their sports
          departments on split balls, bent rings and borrowed stopwatches.
          Parents and communities are frequently tapped for additional funding,
          in an inefficient and adhoc manner, for items which are broadly
          described with unclear goals and timings.
        </p>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Kit Up makes this process better. Supported by Australian Sports
          Foundation, a school lists real items it needs, priced from a real
          catalogue, and anyone can fund a whole item or a share of one. Each
          donation is tax deductible and the Australian Sports Foundation
          receives funds and the schools Wish List campaign items. The items (as
          near as possible) are funded and provided to the school. No vague
          donation jars, just kit on the court.
        </p>
      </section>

      {/* Trust & safety */}
      <section id="trust" className="mt-14 scroll-mt-24 max-w-2xl">
        <h2 className="font-display text-2xl font-bold text-ink">
          Trust &amp; safety
        </h2>
        <p className="mt-3 leading-relaxed text-ink-soft">
          We want donors to give with confidence and schools to be taken at
          their word. A few things we build in:
        </p>
        <ul className="mt-6 space-y-5">
          <TrustPoint
            icon={<BadgeCheck className="h-5 w-5" aria-hidden />}
            title="Verified schools"
            body="School accounts are checked against a public schools registry, and verified schools carry a badge so donors know who they're backing."
          />
          <TrustPoint
            icon={<Tag className="h-5 w-5" aria-hidden />}
            title="Real prices, real items"
            body="Every item on a campaign is priced from the Hart Sport catalogue — donors can see exactly what their money buys."
          />
          <TrustPoint
            icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
            title="Funds tied to kit"
            body="Money is raised against specific items. When an item is funded it's ordered and shipped to the school."
          />
          <TrustPoint
            icon={<Receipt className="h-5 w-5" aria-hidden />}
            title="Tax-deductible, via the Australian Sports Foundation"
            body="Donations are made through the Australian Sports Foundation, which receives the funds and the school's Wish List and arranges the kit — so your gift is tax-deductible."
          />
          <TrustPoint
            icon={<Lock className="h-5 w-5" aria-hidden />}
            title="Payments handled securely"
            body="Payments are processed by Stripe; we never store card details. Donation records are kept as a permanent trail."
          />
        </ul>
      </section>
    </div>
  );
}

function TrustPoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-coral-tint text-coral-dark">
        {icon}
      </span>
      <div>
        <h3 className="font-bold text-ink">{title}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{body}</p>
      </div>
    </li>
  );
}
