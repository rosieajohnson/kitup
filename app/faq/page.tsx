import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Help & FAQs",
  description:
    "A friendly, step-by-step guide to creating your school account on Kit Up and starting your first campaign.",
};

export default function FaqPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Help &amp; FAQs
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          A simple, step-by-step guide to setting up your school and starting a
          campaign. It takes about ten minutes, there&apos;s no cost, and you
          can&apos;t break anything — take your time and follow along below.
        </p>
      </div>

      {/* On-page contents — handy for jumping to a section */}
      <nav
        aria-label="On this page"
        className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5"
      >
        <p className="text-sm font-bold text-ink">On this page</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {CONTENTS.map(([label, href]) => (
            <li key={href}>
              <a
                href={href}
                className="text-sm font-medium text-coral transition-colors hover:text-coral-dark"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="getting-started" title="Getting started">
        <Faq q="What is Kit Up, in a nutshell?">
          <p>
            It&apos;s a website where your school lists the sports kit it needs,
            and people — parents, locals, supporters — chip in to help pay for
            it, one item at a time. You choose the gear from a catalogue, we show
            it to donors, and the money goes toward buying it.
          </p>
        </Faq>
        <Faq q="What do I need before I begin?">
          <p>Just three things:</p>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>
              Your school&apos;s <strong>name</strong>, <strong>suburb</strong>{" "}
              and <strong>postcode</strong>.
            </li>
            <li>
              Your school&apos;s <strong>ABN</strong> (the 11-digit Australian
              Business Number). If you don&apos;t know it, you can look it up on{" "}
              <ExternalLink href="https://www.abr.business.gov.au">
                www.abr.business.gov.au
              </ExternalLink>
              .
            </li>
            <li>
              Your <strong>email address</strong>.
            </li>
          </ol>
        </Faq>
      </Section>

      <Section id="creating-your-account" title="Creating your account">
        <Faq q="Where do I start?">
          <p>
            Go to the Kit Up website and click{" "}
            <Link
              href="/sign-up"
              className="font-semibold text-coral hover:text-coral-dark"
            >
              Create an account
            </Link>{" "}
            (or <strong>Sign up</strong>). The page is already set up for
            schools, so you don&apos;t need to change anything.
          </p>
        </Faq>
        <Faq q="What will it ask me?">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong>School name</strong> — type your school&apos;s full name,
              e.g. <em>Brunswick East Primary School</em>.
            </li>
            <li>
              <strong>Suburb</strong> and <strong>Postcode</strong> — the
              postcode is important; we use it to find your school.
            </li>
            <li>
              <strong>ABN</strong> — type the 11 digits. Spaces are fine.
            </li>
            <li>
              <strong>Email</strong> and a <strong>Password</strong> (more on the
              password below).
            </li>
          </ul>
          <p>
            Then click <strong>Create a school account</strong>.
          </p>
        </Faq>
        <Faq q="Why does it ask for our ABN and postcode?">
          <p>
            This is how we confirm you really are the school you say you are — it
            keeps donors&apos; trust. We quietly check the name and postcode
            against the official schools registry (ACARA), and the ABN against
            the national business register. You don&apos;t have to do anything
            for this; it happens in the background. We also use this as the
            address to deliver the goods on your list to.
          </p>
        </Faq>
        <Faq q={`It says my school name "doesn't match" — what did I do wrong?`}>
          <p>
            Almost certainly nothing serious! This usually means a small spelling
            difference or a postcode typo. Helpfully, the page will show you a
            short list of real schools and say <strong>&quot;Did you
            mean:&quot;</strong>. Just <strong>click the correct school name</strong>{" "}
            from that list and it will fill it in for you. If your school
            isn&apos;t listed, double-check the <strong>postcode</strong> —
            that&apos;s the most common cause.
          </p>
        </Faq>
        <Faq q="What are the password rules?">
          <p>
            Your password needs to be at least <strong>6 characters</strong> and
            include:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              one <strong>capital letter</strong>,
            </li>
            <li>
              one <strong>number</strong>, and
            </li>
            <li>
              one <strong>symbol</strong> (like{" "}
              <code className="rounded bg-surface-sunk px-1 py-0.5 text-sm">
                !
              </code>
              ,{" "}
              <code className="rounded bg-surface-sunk px-1 py-0.5 text-sm">
                ?
              </code>{" "}
              or{" "}
              <code className="rounded bg-surface-sunk px-1 py-0.5 text-sm">
                #
              </code>
              ).
            </li>
          </ul>
          <p>
            A little tick-list appears as you type so you can see when it&apos;s
            happy. (An example of the style:{" "}
            <code className="rounded bg-surface-sunk px-1 py-0.5 text-sm">
              Kitup2026!
            </code>
            )
          </p>
        </Faq>
      </Section>

      <Section id="confirming-your-email" title="Confirming your email">
        <Faq q="I created the account — why can't I sign in yet?">
          <p>
            For security, we send a confirmation email first. Open your inbox,
            find the email from Kit Up, and <strong>click the link inside</strong>.
            It will take you to a page with a button — <strong>click that
            button</strong> to finish confirming. Then you&apos;re all set to
            sign in.
          </p>
        </Faq>
        <Faq q="The email hasn't arrived. What now?">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              Give it a few minutes — it&apos;s usually quick, but can
              occasionally take a little while.
            </li>
            <li>
              Check your <strong>Junk</strong> or <strong>Spam</strong> folder.
            </li>
            <li>
              If your school uses an email security system, the link sometimes
              needs a second click — that&apos;s normal.
            </li>
            <li>
              Still nothing? Try signing in anyway; if your email isn&apos;t
              confirmed yet, we&apos;ll offer to send the link again.
            </li>
          </ul>
        </Faq>
      </Section>

      <Section id="signing-in" title="Signing in">
        <Faq q="How do I sign in from now on?">
          <p>
            Click{" "}
            <Link
              href="/sign-in"
              className="font-semibold text-coral hover:text-coral-dark"
            >
              Sign in
            </Link>
            , enter your <strong>email</strong> and <strong>password</strong>,
            and click <strong>Sign in</strong>. You&apos;ll land on your school{" "}
            <strong>Dashboard</strong>.
          </p>
        </Faq>
        <Faq q="I've forgotten my password.">
          <p>
            No problem. On the sign-in page, click{" "}
            <strong>&quot;Forgot password?&quot;</strong> and follow the steps in
            the email we send you.
          </p>
        </Faq>
      </Section>

      <Section id="starting-a-campaign" title="Starting your first campaign">
        <Faq q="How do I create a campaign?">
          <p>
            From your <strong>Dashboard</strong>, click to create a new campaign.
            You&apos;ll give it:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              a <strong>title</strong> (e.g.{" "}
              <em>New netball kit for our Year 5s</em>),
            </li>
            <li>
              a short <strong>description</strong> of what you need and why, and
            </li>
            <li>
              the <strong>items</strong> you&apos;d like funded.
            </li>
          </ul>
        </Faq>
        <Faq q="How do I add the items we need?">
          <p>
            You choose them from the <strong>Hart Sport catalogue</strong> built
            into Kit Up — so the prices are already correct and you don&apos;t
            have to look anything up. There&apos;s a <strong>search box</strong>:
            just type what you&apos;re after (e.g. <em>&quot;netball&quot;</em> or{" "}
            <em>&quot;cones&quot;</em>) and pick the items. Add as many as you
            need.
          </p>
        </Faq>
        <Faq q="What happens after I add everything?">
          <p>
            You&apos;ll see a <strong>Review</strong> step so you can check it all
            over. When you&apos;re happy, click <strong>&quot;Review &amp; go
            live&quot;</strong> to publish it. Until then it stays a private{" "}
            <strong>draft</strong> that only you can see — so feel free to set it
            up, leave it, and come back later.
          </p>
        </Faq>
        <Faq q="Can I change things after it's live?">
          <p>
            Yes. From your dashboard you can open the campaign and{" "}
            <strong>edit</strong> it whenever you like.
          </p>
        </Faq>
      </Section>

      <Section id="reassurances" title="A few reassurances">
        <Faq q="Will this cost the school anything?">
          <p>No — creating an account and running a campaign is free.</p>
        </Faq>
        <Faq q="What if I get stuck?">
          <p>
            That&apos;s completely fine. You can close the page and come back —
            nothing is lost. If you&apos;d like a hand, use the{" "}
            <Link
              href="/contact"
              className="font-semibold text-coral hover:text-coral-dark"
            >
              Contact
            </Link>{" "}
            page and someone will help you.
          </p>
        </Faq>
      </Section>

      {/* Bottom call to action */}
      <div className="mt-16 flex max-w-2xl flex-wrap gap-3 rounded-xl border border-line bg-surface p-6 shadow-card">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold text-ink">
            Ready to begin?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Setting up your school takes about ten minutes.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/contact">
            <Button variant="outline">Contact us</Button>
          </Link>
          <Link href="/sign-up">
            <Button>Create an account</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

const CONTENTS: [string, string][] = [
  ["Getting started", "#getting-started"],
  ["Creating your account", "#creating-your-account"],
  ["Confirming your email", "#confirming-your-email"],
  ["Signing in", "#signing-in"],
  ["Starting your first campaign", "#starting-a-campaign"],
  ["A few reassurances", "#reassurances"],
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14 max-w-2xl scroll-mt-24">
      <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <h3 className="font-display text-lg font-bold text-ink">{q}</h3>
      <div className="mt-2 space-y-3 leading-relaxed text-ink-soft">
        {children}
      </div>
    </div>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-coral hover:text-coral-dark"
    >
      {children}
    </a>
  );
}
