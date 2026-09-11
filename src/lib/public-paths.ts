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

// `/welcome` is the marketing landing page - the front door a logged-out
// visitor is sent to instead of a bare password field. It has to be reachable
// without a session for the same reason the waitlist page did.
const PUBLIC_EXACT = new Set(["/privacy", "/terms", "/accessibility", "/welcome"]);
const PUBLIC_PREFIXES = ["/waitlist"];

// Static files served from public/ that must never be bounced to the waitlist.
// The middleware matcher in proxy.ts already excludes these, so normally the
// middleware never runs on them; this is the second layer, in case the matcher
// is ever loosened. robots.txt in particular has to stay reachable for the
// pre-launch `Disallow: /` to mean anything.
const PUBLIC_FILES = new Set(["/robots.txt", "/sitemap.xml"]);

export function isPublicPath(pathname: string): boolean {
  // API routes carry their own auth (session cookie / webhook signature).
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
