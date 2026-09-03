// Which paths an unauthenticated visitor may reach while the whole app sits
// behind the waitlist gate (src/proxy.ts). Kept dependency-free so it is unit
// testable without standing up a NextRequest.
//
// `/waitlist` is matched as a PREFIX, on purpose. The confirmation link in the
// signup email points at `/waitlist/confirm?token=...`; the previous
// exact-match allowlist (`["/waitlist", …].includes(pathname)`) redirected
// every click on that link to `/waitlist` before the confirm page could run,
// so no signup could ever be confirmed in production. The legal pages have no
// sub-routes and stay exact.

const PUBLIC_EXACT = new Set(["/privacy", "/terms", "/accessibility"]);
const PUBLIC_PREFIXES = ["/waitlist"];

export function isPublicPath(pathname: string): boolean {
  // API routes carry their own auth (session cookie / webhook signature).
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
