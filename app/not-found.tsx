import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-display text-6xl font-bold text-coral">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">
        We couldn&apos;t find that campaign
      </h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        It may have closed or moved. Plenty of schools still need a hand.
      </p>
      <Link href="/#browse" className="mt-6">
        <Button size="lg">Browse open campaigns</Button>
      </Link>
    </div>
  );
}
