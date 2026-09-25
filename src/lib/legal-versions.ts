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
// 2026-09-19: the four sections that were explicitly unfinished are now
// written - §7 (the arbitration/class-waiver clause was REMOVED rather than
// completed, being unenforceable against EU consumers, and replaced with a
// complaints and mediation route), §9 (VAT, the 14-day withdrawal right,
// refunds, proration, price-change notice), §10 (the "as is / no warranties"
// exclusion was removed as unenforceable under Directive (EU) 2019/770 and
// replaced with a conformity promise, a €100-or-fees cap and mandatory
// carve-outs), and §12 (Belgian law, preserving the consumer's own courts and
// mandatory local protections). §3 gained an explicit 18+ requirement and §14
// now points at the new Legal notice page. Material by any measure, so the
// date moves and existing consent rows correctly point at the older text.
// 2026-09-25: §2 regulator wording, §9 withdrawal text made accurate (checkout
// requires the express-start request - there is no deferred-start path), the
// proration paragraph replaced (there is one paid plan), the 14-day past_due
// grace stated, cancellation path corrected, §14 now gives the contact email
// directly instead of pointing at the unpublished Legal notice.
export const TOS_VERSION = "2026-09-25";

/** ISO date of the current Privacy Policy revision. */
// 2026-09-18: subprocessor list made complete (Vercel, Stripe, the email
// provider were all missing), the waitlist clause corrected - it claimed
// entries were "not shared with anyone else" while confirmation mail routes
// through Resend or Gmail SMTP - and the Vercel function region stated now
// that vercel.json pins it. All three were material, so the date moves with
// them rather than leaving consent rows pointing at a document that no longer
// exists.
// 2026-09-25: contact address published; signup consent record (IP, user-agent) disclosed; transfers
// section covers Stripe/Resend/Google; portfolio-ticker context to the model
// stated accurately; auth-log retention stated as 24 hours; deletion now
// cancels Stripe; 18+ made firm; Belgian DPA named. Revised the same day:
// the Cerebras backup provider was removed from the app, so it is no longer
// listed. Dropping a processor only narrows what the accepted text allowed,
// so the version date stays.
// 2026-09-26: hCaptcha (security check on the sign-in and account forms)
// added as a processor. The same day the AI provider was briefly listed as
// DeepInfra; that switch never went live (sign-up needed a VAT number), so
// the page names Groq again, as it did before.
export const PRIVACY_VERSION = "2026-09-26";

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
