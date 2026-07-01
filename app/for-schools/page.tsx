import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  ShieldCheck,
  Rocket,
  HandHeart,
  PackageCheck,
  Tag,
  Receipt,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "For schools",
  description:
    "How Australian schools use Kit Up to list the sports gear they need and have the community fund it, item by item.",
};

export default function ForSchoolsPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      {/* Intro */}
      <div className="max-w-2xl">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft">
          <ShieldCheck className="h-3.5 w-3.5 text-turf" aria-hidden />
          For Australian schools
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Kit Up your school sports clubs, without the fundraising scramble
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          List the exact kit your school needs, priced from a real catalogue,
          and let your community fund it item by item. Donations are
          tax-deductible through the Australian Sports Foundation, and the kit
          is arranged and provided to the school.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sign-up?role=school">
            <Button size="lg">Create a school account</Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="outline">
              Go to your dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* How it works for schools */}
      <section className="mt-16 max-w-3xl">
        <h2 className="font-display text-2xl font-bold text-ink">
          How it works for your school
        </h2>
        <ol className="mt-8 space-y-6">
          <Step
            n={1}
            icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
            title="Create your school account"
            body="Sign up as a school. Your name is checked against the public schools registry, and verified schools carry a badge donors can trust."
          />
          <Step
            n={2}
            icon={<ClipboardList className="h-5 w-5" aria-hidden />}
            title="Build your Wish List"
            body="Add exactly what you need from the built-in catalogue — real items at real prices, with a clear goal and deadline."
          />
          <Step
            n={3}
            icon={<Rocket className="h-5 w-5" aria-hidden />}
            title="Review & go live"
            body="Check the details, then publish. Until you go live your campaign stays as a private draft only you can see."
          />
          <Step
            n={4}
            icon={<HandHeart className="h-5 w-5" aria-hidden />}
            title="The community funds it"
            body="Donors fund whole items or a share of them. Donations are tax-deductible via the Australian Sports Foundation, which receives the funds and your campaign's Wish List."
          />
          <Step
            n={5}
            icon={<PackageCheck className="h-5 w-5" aria-hidden />}
            title="Receive your kit"
            body="Funded items are arranged and provided to your school — as near as possible to what you listed. No vague donation jars, just gear on the court."
          />
        </ol>
      </section>

      {/* Why schools use Kit Up */}
      <section className="mt-16 max-w-3xl">
        <h2 className="font-display text-2xl font-bold text-ink">
          Why schools use Kit Up
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Benefit
            icon={<Tag className="h-5 w-5" aria-hidden />}
            title="Real items, real prices"
            body="No vague targets — every line is a specific product at its catalogue price."
          />
          <Benefit
            icon={<Receipt className="h-5 w-5" aria-hidden />}
            title="Tax-deductible giving"
            body="Donations flow through the Australian Sports Foundation, so your supporters can claim them."
          />
          <Benefit
            icon={<HandHeart className="h-5 w-5" aria-hidden />}
            title="No ad-hoc fundraising"
            body="Skip the sausage sizzles and chasing parents — share one clear campaign instead."
          />
          <Benefit
            icon={<Eye className="h-5 w-5" aria-hidden />}
            title="See who chipped in"
            body="Track funding item by item and see the supporters backing your campaign."
          />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mt-16 rounded-xl border border-line bg-surface p-8 text-center shadow-card">
        <h2 className="font-display text-2xl font-bold text-ink">
          Ready to kit up?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">
          Create your school account and build your first Wish List in minutes.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/sign-up?role=school">
            <Button size="lg">Create a school account</Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-coral-tint text-coral-dark">
        {icon}
        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
          {n}
        </span>
      </span>
      <div>
        <h3 className="font-bold text-ink">{title}</h3>
        <p className="mt-0.5 leading-relaxed text-ink-soft">{body}</p>
      </div>
    </li>
  );
}

function Benefit({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-coral-tint text-coral-dark">
        {icon}
      </span>
      <h3 className="mt-3 font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
