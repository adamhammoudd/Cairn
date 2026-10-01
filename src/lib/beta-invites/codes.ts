import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Personal beta-invite codes. Pure (node:crypto only) so every rule here is
// testable without a database.
//
// A code is 24 random bytes from the OS CSPRNG, base64url-encoded: 32
// URL-safe characters, 192 bits. It exists in exactly two places - the link in
// the email and the person's address bar. The database stores SHA-256(code)
// and nothing else, so a leaked table cannot be turned into working links.
// Never log a code, put it in analytics, or return it from a server action.

export const INVITE_CODE_BYTES = 24;
export const INVITE_EXPIRY_DAYS = 14;
export const INVITE_REMINDER_AFTER_DAYS = 7;

/**
 * The only thing an invalid link ever says. Expired, revoked, already used and
 * unknown all read the same, so the page cannot be used to learn which codes
 * exist or what happened to someone else's invite.
 */
export const INVITE_INVALID_MESSAGE =
  "This invite has expired or was already used. Reply to our email and we'll send a new one.";

export const INVITE_WRONG_EMAIL_MESSAGE = "This invite only works for the email address it was sent to.";

export function generateInviteCode(): string {
  return randomBytes(INVITE_CODE_BYTES).toString("base64url");
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

// Base64url of 24+ bytes, with an upper bound so a hand-crafted URL can't make
// us hash megabytes. Anything else is rejected before it reaches the database.
const CODE_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function isWellFormedInviteCode(code: string | null | undefined): code is string {
  return typeof code === "string" && CODE_RE.test(code);
}

/**
 * Constant-time comparison of two SHA-256 hex digests. The lookup itself is by
 * hash (an index probe that reveals nothing about near-misses); this is the
 * second check on the row that came back, so no code path compares secrets
 * with `===`.
 */
export function inviteHashesMatch(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Lower-cased and trimmed - the same normalisation the waitlist uses. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}
