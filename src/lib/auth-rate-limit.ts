import { createHash } from "node:crypto";
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Brute-force protection for the credential endpoints: 5 attempts per 15
// minutes, counted per identifier and independently per client IP.
//
// Counted per *identifier* so one account cannot be sprayed, and per *IP* so
// one host cannot spray many accounts - a limit on only the first is trivially
// defeated by walking an email list, and a limit on only the second by
// rotating IPs.
//
// Successful attempts are recorded but do not count toward the limit, so a
// user who signs in correctly is never locked out by their own activity.

export const MAX_ATTEMPTS = 5;
export const WINDOW_MINUTES = 15;

export type AuthAttemptKind = "sign_in" | "sign_up" | "password_reset";

// Hashed with a server-side salt so the table is not a plaintext list of every
// address anyone has tried. SUPABASE_SERVICE_ROLE_KEY is already a server-only
// secret and is stable across instances, which is what a peppering value needs
// to be; a dedicated AUTH_HASH_SALT is preferred if one is configured.
function hashIdentifier(value: string): string {
  const salt = process.env.AUTH_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "cairn-dev-salt";
  return createHash("sha256").update(`${value.toLowerCase()}:${salt}`).digest("hex");
}

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterMinutes: number;
  message?: string;
}

const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterMinutes: 0 };

async function countRecentFailures(identifier: string, kind: AuthAttemptKind): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("auth_attempts")
    .select("*", { count: "exact", head: true })
    .eq("identifier_hash", hashIdentifier(identifier))
    .eq("kind", kind)
    .eq("succeeded", false)
    .gte("attempted_at", since);
  return count ?? 0;
}

/**
 * Checks both the account identifier and the client IP. Fails OPEN on a
 * database error: a transient DB problem must not lock every user out of the
 * product. The tradeoff is explicit rather than incidental - the window where
 * this degrades is a window where sign-in is largely broken anyway.
 */
export async function checkAuthRateLimit(
  identifier: string,
  kind: AuthAttemptKind,
  clientIp?: string | null,
): Promise<RateLimitVerdict> {
  try {
    const checks = [countRecentFailures(identifier, kind)];
    if (clientIp) checks.push(countRecentFailures(`ip:${clientIp}`, kind));

    const [identifierFailures, ipFailures = 0] = await Promise.all(checks);

    if (identifierFailures >= MAX_ATTEMPTS || ipFailures >= MAX_ATTEMPTS) {
      return {
        allowed: false,
        retryAfterMinutes: WINDOW_MINUTES,
        // Deliberately does not say whether the account exists, and is the same
        // message for identifier-limited and IP-limited - neither should be an
        // oracle.
        message: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.`,
      };
    }
    return ALLOWED;
  } catch {
    return ALLOWED;
  }
}

export async function recordAuthAttempt(
  identifier: string,
  kind: AuthAttemptKind,
  succeeded: boolean,
  clientIp?: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const rows = [{ identifier_hash: hashIdentifier(identifier), kind, succeeded }];
    if (clientIp) rows.push({ identifier_hash: hashIdentifier(`ip:${clientIp}`), kind, succeeded });
    await admin.from("auth_attempts").insert(rows);
  } catch {
    // Never let bookkeeping fail a sign-in the credentials themselves allowed.
  }
}
