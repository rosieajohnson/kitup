import { percent, money } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ProgressMeterProps {
  raised: number;
  goal: number;
  /** Show the "$X of $Y" + percentage caption above the lane. */
  showCaption?: boolean;
  className?: string;
}

/**
 * Kit Up's signature element: a funding bar drawn like a painted
 * sports-court lane. Hash marks score the empty track, turf-green
 * fills it, and a coral "runner" marks the leading edge. At 100%
 * the runner becomes a finish flag.
 */
export function ProgressMeter({
  raised,
  goal,
  showCaption = true,
  className,
}: ProgressMeterProps) {
  const pct = percent(raised, goal);
  const complete = pct >= 100;

  return (
    <div className={cn("w-full", className)}>
      {showCaption && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">
            {money(raised)}
            <span className="font-medium text-ink-faint">
              {" "}
              of {money(goal)}
            </span>
          </p>
          <p
            className={cn(
              "text-sm font-bold tabular-nums",
              complete ? "text-turf-dark" : "text-coral-dark",
            )}
          >
            {pct}%
          </p>
        </div>
      )}

      <div
        className="lane"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${pct}% funded`}
      >
        <div className="lane-fill" style={{ width: `${pct}%` }} />
        {complete ? (
          <span
            aria-hidden
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[0.7rem]"
          >
            🏁
          </span>
        ) : (
          pct > 0 && <span className="lane-runner" style={{ left: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}
