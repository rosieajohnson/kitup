"use client";

import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password";
import { cn } from "@/lib/utils";

/**
 * Live checklist of the password rules, ticking each off as the user types.
 * Shown wherever a new password is set.
 */
export function PasswordChecklist({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  return (
    <ul
      aria-label="Password requirements"
      className={cn("grid grid-cols-1 gap-1 sm:grid-cols-2", className)}
    >
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              ok ? "font-medium text-turf-dark" : "text-ink-faint",
            )}
          >
            {ok ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="h-3 w-3 shrink-0" aria-hidden />
            )}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
