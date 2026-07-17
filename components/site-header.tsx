import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { CartButton } from "@/components/cart/cart-button";
import { getViewer } from "@/lib/auth";

export async function SiteHeader() {
  // Reflect auth state when Supabase is connected; on the mock/dev path
  // there's no session, so we just show the signed-out actions.
  const viewer = await getViewer();
  const signedIn = Boolean(viewer.userId);
  const roleLabel =
    viewer.role === "school"
      ? "School"
      : viewer.role === "donor"
        ? "Donor"
        : null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Wordmark />

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/#how"
            className="rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            How it works
          </Link>
          <Link
            href="/#browse"
            className="rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Browse campaigns
          </Link>
          <Link
            href="/for-schools"
            className="rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            For schools
          </Link>
          {viewer.isAdmin && (
            <Link
              href="/admin"
              className="rounded-full px-3 py-2 text-sm font-semibold text-coral transition-colors hover:text-coral-dark"
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn && (
            <Link
              href="/dashboard/profile"
              title="Edit your profile"
              className="hidden max-w-[14rem] truncate text-sm text-ink-soft transition-colors hover:text-ink sm:inline"
            >
              <span className="font-semibold text-ink">
                {viewer.name ?? "Account"}
              </span>
              {roleLabel && (
                <span className="text-ink-faint"> ({roleLabel})</span>
              )}
            </Link>
          )}
          <CartButton />
          {signedIn ? (
            <SignOutButton />
          ) : (
            <Link href="/sign-in" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
          )}
          <Link href="/#browse">
            <Button size="sm">Fund some Kit</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
