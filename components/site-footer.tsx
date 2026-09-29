import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-xs text-sm text-ink-soft">
            Crowdfunding that puts real sports kit in the hands of local
            schools — one item at a time.
          </p>
        </div>

        <FooterCol
          title="Donors"
          links={[
            ["Browse campaigns", "/#browse"],
            ["How funding works", "/#how"],
            ["Sign in", "/sign-in"],
          ]}
        />
        <FooterCol
          title="Schools"
          links={[
            ["Start a campaign", "/dashboard"],
            ["Help & FAQs", "/faq"],
            ["The Hart Sport catalogue", "https://hartsport.com.au"],
            ["School sign in", "/sign-in"],
          ]}
        />
        <FooterCol
          title="About"
          links={[
            ["Our mission", "/about#mission"],
            ["Trust & safety", "/about#trust"],
            ["Privacy policy", "/privacy"],
            ["Terms & conditions", "/terms"],
            ["Grant agreement", "/grant-agreement"],
            ["Contact", "/contact"],
          ]}
        />
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Kit Up. Made for Australian schools.</p>
          <p>Prices sourced from the Hart Sport catalogue.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold text-ink">{title}</h3>
      <ul className="space-y-2">
        {links.map(([label, href]) => {
          const external = href.startsWith("http");
          return (
            <li key={label}>
              {external ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-soft transition-colors hover:text-ink"
                >
                  {label}
                </a>
              ) : (
                <Link
                  href={href}
                  className="text-sm text-ink-soft transition-colors hover:text-ink"
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
