import Link from "next/link";
import { cn } from "@/lib/utils";

/** Kit Up wordmark: a court-line "K" mark plus the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2", className)}
      aria-label="Kit Up — home"
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          {/* upward "kit out" chevrons */}
          <path
            d="M5 15l7-6 7 6"
            stroke="var(--color-coral)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 19l7-6 7 6"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.55"
          />
        </svg>
      </span>
      <span className="font-display text-xl font-bold tracking-tight text-ink">
        Kit Up
      </span>
    </Link>
  );
}
