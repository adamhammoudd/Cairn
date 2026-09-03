// Single source of truth for the Terms of Service and Privacy Policy revision
// dates.
//
//  - Rendered as "Last updated ..." on /terms, /privacy and /accessibility
//    (through LegalShell), so the date a user sees is the date that is stored.
//  - Recorded against every signup in `user_consents` (migration 0037), so a
//    later revision to either document leaves a record of exactly which version
//    each account agreed to.
//
// When either document changes materially, bump the matching constant to its
// new "last updated" date (ISO, YYYY-MM-DD). That is the whole update - the
// pages and the consent record both read from here.

/** ISO date of the current Terms of Service revision. */
export const TOS_VERSION = "2026-08-30";

/** ISO date of the current Privacy Policy revision. */
export const PRIVACY_VERSION = "2026-08-30";

/**
 * "30 August 2026" - the format LegalShell's "Last updated" line expects.
 * Fixed locale and UTC so the string is identical on server and client (this
 * renders inside server components, but keeping it deterministic avoids a
 * future hydration trap if it moves).
 */
export function legalDateDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whether the signup form's consent checkbox was submitted checked. "on" is
 * what an HTML checkbox posts when checked with no explicit value; the others
 * cover a programmatic client. Lives here (not in the "use server" auth
 * module, which may only export async functions) so it can be unit tested.
 */
export function consentGiven(formData: Pick<FormData, "get">): boolean {
  const raw = formData.get("consent");
  return raw === "on" || raw === "true" || raw === "1";
}
