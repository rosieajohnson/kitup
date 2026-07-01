import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Tone = "neutral" | "turf" | "coral" | "sun";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunk text-ink-soft",
  turf: "bg-turf-tint text-turf-dark",
  coral: "bg-coral-tint text-coral-dark",
  sun: "bg-[#fbedcd] text-[#7a5a16]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
