/**
 * Build the request's browsable origin from headers. Prefer the Host header
 * (what the client actually connected to — localhost, a LAN IP, or the prod
 * domain) over req.url, whose host is the *bind* address (e.g. 0.0.0.0 when
 * the dev server runs with -H 0.0.0.0), which browsers can't open.
 */
export function originFromHeaders(
  h: { get(name: string): string | null },
  fallback = "http://localhost:3000",
): string {
  const host = h.get("host");
  if (!host) return fallback;
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
