import Link from "next/link";
import { Button } from "@/components/ui/button";
import { confirmOtp } from "./actions";

/**
 * Click-to-continue confirmation page. The email links here (GET) with a
 * token_hash; loading the page does NOT verify anything — only the button
 * (a POST server action) does. This defeats email link scanners (Mimecast,
 * Safe Links) that pre-fetch links and would otherwise consume the one-time
 * token before the user clicks.
 *
 * Email templates link here with, e.g.:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const token_hash = sp.token_hash ?? "";
  const type = sp.type ?? "";
  const next = sp.next ?? "/";
  const isRecovery = type === "recovery";

  const wrap =
    "container-page flex min-h-[70vh] items-center justify-center py-12";
  const card =
    "w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-card";

  if (!token_hash || !type) {
    return (
      <div className={wrap}>
        <div className={card}>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            This link looks incomplete
          </h1>
          <p className="mt-2 text-ink-soft">
            Please use the most recent link from your email, or request a new
            one.
          </p>
          <div className="mt-6">
            <Link href="/forgot-password">
              <Button variant="outline" size="lg" className="w-full">
                Request a new link
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <div className={card}>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Almost there
        </h1>
        <p className="mt-2 text-ink-soft">
          Click below to {isRecovery ? "reset your password" : "confirm your email"}.
        </p>
        <form action={confirmOtp} className="mt-6">
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" size="lg" className="w-full">
            {isRecovery ? "Reset my password" : "Confirm my email"}
          </Button>
        </form>
        <p className="mt-4 text-xs text-ink-faint">
          This extra step keeps your one-time link from being used up by email
          security scanners before you click.
        </p>
      </div>
    </div>
  );
}
