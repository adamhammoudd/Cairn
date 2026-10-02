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
// address anyone has tried. The salt MUST be a dedicated secret, AUTH_HASH_SALT.
// It used to fall back to the service-role key (reusing a secret that opens the
// whole database as a hashing pepper) and then to the literal "cairn-dev-salt"
// (a public constant, so the hashes of common emails could be precomputed)
// - audit 2026-10-02, item 2.4. Now there is no fallback: missing means loud.
export function requireAuthHashSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.AUTH_HASH_SALT;
  if (!salt || salt.length < 16) {
    throw new Error(
      "AUTH_HASH_SALT is not set (or shorter than 16 characters). It salts the sign-in attempt log; set it to a long random string in the environment. Refusing to run the credential endpoints without it.",
    );
  }
  return salt;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(`${value.toLowerCase()}:${requireAuthHashSalt()}`).digest("hex");
}

/** Where the limiter reads and writes. Injectable so the fail-closed path can be tested without a database. */
export interface RateLimitDb {
  countFailures(identifierHash: string, kind: AuthAttemptKind, sinceIso: string): Promise<number>;
  insertAttempts(rows: { identifier_hash: string; kind: AuthAttemptKind; succeeded: boolean }[]): Promise<void>;
}

const supabaseDb: RateLimitDb = {
  async countFailures(identifierHash, kind, sinceIso) {
    const { count, error } = await createAdminClient()
      .from("auth_attempts")
      .select("*", { count: "exact", head: true })
      .eq("identifier_hash", identifierHash)
      .eq("kind", kind)
      .eq("succeeded", false)
      .gte("attempted_at", sinceIso);
    // A database error used to read as "0 failures" here, which is how the
    // limiter failed open without ever reaching its catch block.
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async insertAttempts(rows) {
    const { error } = await createAdminClient().from("auth_attempts").insert(rows);
    if (error) throw new Error(error.message);
  },
};

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterMinutes: number;
  message?: string;
}

const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterMinutes: 0 };

async function countRecentFailures(db: RateLimitDb, identifier: string, kind: AuthAttemptKind): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  return db.countFailures(hashIdentifier(identifier), kind, since);
}

/**
 * Checks both the account identifier and the client IP.
 *
 * On a database error, SIGN-IN fails CLOSED: with the counter unreadable,
 * "allowed" would let a password-guessing run through exactly when the
 * protection is down. The user gets a plain message and a log line records it.
 * Other kinds (sign-up, password reset) stay open on error - a short outage
 * there costs a delayed email, not an open door - but are logged too.
 */
export async function checkAuthRateLimit(
  identifier: string,
  kind: AuthAttemptKind,
  clientIp?: string | null,
  db: RateLimitDb = supabaseDb,
): Promise<RateLimitVerdict> {
  try {
    const checks = [countRecentFailures(db, identifier, kind)];
    if (clientIp) checks.push(countRecentFailures(db, `ip:${clientIp}`, kind));

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
  } catch (err) {
    // Never the identifier or the IP in the log - only what failed.
    console.error(`[cairn] auth rate limit (${kind}): could not read the attempt log (${err instanceof Error ? err.message : "unknown"}); ${kind === "sign_in" ? "refusing the attempt" : "allowing it"}`);
    if (kind === "sign_in") {
      return {
        allowed: false,
        retryAfterMinutes: 1,
        message: "We couldn't check sign-in attempts just now, so sign-in is paused for a moment. Please try again in a minute.",
      };
    }
    return ALLOWED;
  }
}

export async function recordAuthAttempt(
  identifier: string,
  kind: AuthAttemptKind,
  succeeded: boolean,
  clientIp?: string | null,
  db: RateLimitDb = supabaseDb,
): Promise<void> {
  try {
    const rows = [{ identifier_hash: hashIdentifier(identifier), kind, succeeded }];
    if (clientIp) rows.push({ identifier_hash: hashIdentifier(`ip:${clientIp}`), kind, succeeded });
    await db.insertAttempts(rows);
  } catch (err) {
    // Never let bookkeeping fail a sign-in the credentials themselves allowed,
    // but do leave a trace: a silent failure here is a limiter that counts nothing.
    console.error(`[cairn] auth rate limit (${kind}): could not record an attempt (${err instanceof Error ? err.message : "unknown"})`);
  }
}
