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
// `/legal-notice` and `/refunds` are not optional additions to this list.
// Articles 5-6 of the e-Commerce Directive require trader identity to be
// "easily, directly and permanently accessible", and the distance-selling
// rules require the cancellation and withdrawal terms to be available BEFORE
// the consumer is bound. A legally-mandated disclosure sitting behind a login
// wall is the same as not publishing it.
// `/login`, `/forgot-password` and `/reset-password` are public so existing
// beta users can sign back in after signing out or a session expiry, and can
// reset a forgotten password (the emailed reset link lands on /reset-password
// before any session exists). `/signup` stays gated: new accounts come through
// the waitlist until launch.
const PUBLIC_EXACT = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/legal-notice",
  "/refunds",
  "/accessibility",
  "/welcome",
]);
const PUBLIC_PREFIXES = ["/waitlist"];

// Static files served from public/ that must never be bounced to the waitlist.
// The middleware matcher in proxy.ts already excludes these, so normally the
// middleware never runs on them; this is the second layer, in case the matcher
// is ever loosened. robots.txt in particular has to stay reachable for the
// pre-launch `Disallow: /` to mean anything.
const PUBLIC_FILES = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt", "/site.webmanifest"]);

// The generated share image (src/app/opengraph-image.tsx). Link-preview bots
// fetch it with no session; the path may carry a hash suffix, so it is a prefix.
const PUBLIC_IMAGE_PREFIX = "/opengraph-image";

export function isPublicPath(pathname: string): boolean {
  // API routes carry their own auth (session cookie / webhook signature).
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  if (pathname.startsWith(PUBLIC_IMAGE_PREFIX)) return true;
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// --------------------------------------------------------------------------
// Beta invites.
//
// Two kinds of /signup?invite=<code> link exist:
//
//   1. Personal invites (the normal path). Single-use, tied to one waitlist
//      address, emailed by the send-beta-invites job. Checked against the
//      database (src/lib/beta-invites) by the signup page and the signUp
//      action - not here, because the proxy has no database access.
//
//   2. MANUAL OVERRIDE - shared codes in BETA_INVITE_CODES, below. Unchanged
//      from before personal invites existed, kept so Adam can still hand-pick
//      someone outside the waitlist order. Comma-separated, set in Vercel; a
//      code is added or revoked by editing the variable and redeploying.
//      Unset or empty means no shared code is valid.

/**
 * Whether the proxy lets an anonymous request through to /signup. Any
 * non-empty `invite` value passes: the signup page itself decides whether it
 * is a usable invite and, if not, shows the one-line "expired or already used"
 * message with a link back to the waitlist - instead of the proxy silently
 * bouncing a truncated or expired link to /waitlist. The page renders no form
 * and the signUp action creates no account without a valid invite, so a
 * request with no valid invite still cannot sign up. /signup with no `invite`
 * at all stays gated.
 */
export function isInviteLinkRequest(pathname: string, invite: string | null): boolean {
  if (pathname !== "/signup" || invite === null) return false;
  const code = invite.trim();
  return code.length > 0 && code.length <= 256;
}

// MANUAL OVERRIDE shared codes, as before. The rules below are unchanged.
//
// Codes shorter than 8 characters are ignored: a short code is guessable, and
// this is the only thing between the public and account creation.
const MIN_INVITE_CODE_LENGTH = 8;

export function inviteCodes(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code.length >= MIN_INVITE_CODE_LENGTH);
}

export function inviteAllowed(invite: string | null | undefined, rawCodes: string | undefined): boolean {
  const code = (invite ?? "").trim();
  if (code === "") return false;
  return inviteCodes(rawCodes).includes(code);
}

/** Whether an anonymous request may reach /signup: only with a valid invite. */
export function isInvitedSignup(
  pathname: string,
  invite: string | null,
  rawCodes: string | undefined,
): boolean {
  return pathname === "/signup" && inviteAllowed(invite, rawCodes);
}
