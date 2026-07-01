const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const AUD_CENTS = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

/** $1,250 — whole-dollar display used across cards and totals. */
export function money(amount: number): string {
  return AUD.format(amount);
}

/** $24.95 — line-item precision where cents matter. */
export function moneyExact(amount: number): string {
  return AUD_CENTS.format(amount);
}

/** Clamp a raised/goal ratio to a 0–100 integer percentage. */
export function percent(raised: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((raised / goal) * 100));
}

/** Whole days from now until the deadline (negative once passed). */
export function daysLeft(deadline: string | Date): number {
  const end = new Date(deadline).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / 86_400_000);
}

/** "12 days left" / "Last day" / "Closed" — human deadline copy. */
export function deadlineLabel(deadline: string | Date): string {
  const d = daysLeft(deadline);
  if (d < 0) return "Closed";
  if (d === 0) return "Last day";
  if (d === 1) return "1 day left";
  return `${d} days left`;
}

/** "14 Jul 2026" */
export function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
