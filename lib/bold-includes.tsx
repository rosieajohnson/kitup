import React from "react";

/**
 * Renders a product description with its contents label — "Includes:",
 * "Kit includes:", "Contains:", etc. — shown in bold. The description itself
 * stays plain text in the DB; this only affects display. Returns the text
 * unchanged when no label is present.
 */
const LABEL = /((?:kit |set )?(?:includes?|contains?))\s*:/i;

export function boldIncludes(
  text: string | null | undefined,
): React.ReactNode {
  if (!text) return text ?? null;
  const m = text.match(LABEL);
  if (!m || m.index == null) return text;
  const start = m.index;
  const end = start + m[0].length;
  return (
    <>
      {text.slice(0, start)}
      <strong className="font-semibold">{text.slice(start, end)}</strong>
      {text.slice(end)}
    </>
  );
}
