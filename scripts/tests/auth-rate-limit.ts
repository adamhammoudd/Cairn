// Integration test for the credential rate limiter (src/lib/auth-rate-limit.ts).
//
// This runs against the real auth_attempts table, not a mock, because the bug
// class it guards against is precisely "the table isn't there / the migration
// never ran". A mocked test would have passed on 2026-08-20, when the limiter
// was fully written, wired into all three credential paths, and completely
// inert because 0022_auth_rate_limit.sql had never been applied to the live
// database.
//
// It also asserts the *shape* of the policy the brief specifies -- 5 attempts
// per 15 minutes -- rather than re-deriving it from the constants, so changing
// MAX_ATTEMPTS silently is a test failure rather than a redefinition of the
// requirement.
//
// Run: npx tsx --conditions=react-server scripts/tests/auth-rate-limit.ts

import "./env";
import {
  checkAuthRateLimit,
  recordAuthAttempt,
  MAX_ATTEMPTS,
  WINDOW_MINUTES,
} from "../../src/lib/auth-rate-limit";
import { createAdminClient } from "../../src/lib/supabase/admin";
import { createHash } from "node:crypto";

const IDENTIFIER = `ratelimit-test-${Math.random().toString(36).slice(2)}@cairn-test.invalid`;

function hashIdentifier(value: string): string {
  const salt = process.env.AUTH_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "cairn-dev-salt";
  return createHash("sha256").update(`${value.toLowerCase()}:${salt}`).digest("hex");
}

const failures: string[] = [];
let passed = 0;

function check(label: string, condition: boolean, detail: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${label} -- ${detail}`);
    console.log(`  FAIL  ${label} -- ${detail}`);
  }
}

async function cleanup() {
  const admin = createAdminClient();
  await admin.from("auth_attempts").delete().eq("identifier_hash", hashIdentifier(IDENTIFIER));
}

async function main() {
  console.log(`auth rate limit: ${MAX_ATTEMPTS} attempts / ${WINDOW_MINUTES} min`);

  // The policy the remediation brief asked for, pinned literally.
  check("policy is 5 attempts", MAX_ATTEMPTS === 5, `MAX_ATTEMPTS=${MAX_ATTEMPTS}`);
  check("policy window is 15 minutes", WINDOW_MINUTES === 15, `WINDOW_MINUTES=${WINDOW_MINUTES}`);

  await cleanup();

  // Fresh identifier must be allowed.
  const fresh = await checkAuthRateLimit(IDENTIFIER, "sign_in", null);
  check("fresh identifier allowed", fresh.allowed, JSON.stringify(fresh));

  // Record MAX_ATTEMPTS - 1 failures: still allowed. This is the boundary that
  // an off-by-one would break, and it is the one a user actually hits.
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
    await recordAuthAttempt(IDENTIFIER, "sign_in", false, null);
  }
  const belowLimit = await checkAuthRateLimit(IDENTIFIER, "sign_in", null);
  check(
    `allowed after ${MAX_ATTEMPTS - 1} failures`,
    belowLimit.allowed,
    JSON.stringify(belowLimit),
  );

  // The Nth failure trips it.
  await recordAuthAttempt(IDENTIFIER, "sign_in", false, null);
  const atLimit = await checkAuthRateLimit(IDENTIFIER, "sign_in", null);
  check(`blocked at ${MAX_ATTEMPTS} failures`, !atLimit.allowed, JSON.stringify(atLimit));
  check(
    "block message does not reveal account existence",
    !atLimit.allowed &&
      typeof atLimit.message === "string" &&
      !/exist|unknown|no account|not found/i.test(atLimit.message),
    `message=${atLimit.message}`,
  );

  // A different action kind must have its own budget -- locking sign_in must
  // not also lock password_reset, or a sprayed account cannot be recovered.
  const otherKind = await checkAuthRateLimit(IDENTIFIER, "password_reset", null);
  check("other kind has an independent budget", otherKind.allowed, JSON.stringify(otherKind));

  // Successes must not count toward the limit.
  const cleanIdentifier = `${IDENTIFIER}.success`;
  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
    await recordAuthAttempt(cleanIdentifier, "sign_in", true, null);
  }
  const afterSuccesses = await checkAuthRateLimit(cleanIdentifier, "sign_in", null);
  check("successful attempts do not lock the account", afterSuccesses.allowed, JSON.stringify(afterSuccesses));

  // Prove the rows really landed in the database -- if the table were missing,
  // recordAuthAttempt swallows the error and every check above would still
  // "pass" by failing open. This is the assertion that catches that.
  const admin = createAdminClient();
  const { count } = await admin
    .from("auth_attempts")
    .select("*", { count: "exact", head: true })
    .eq("identifier_hash", hashIdentifier(IDENTIFIER));
  check(
    "attempts were actually persisted (table exists)",
    (count ?? 0) === MAX_ATTEMPTS,
    `rows found=${count}, expected=${MAX_ATTEMPTS}`,
  );

  // Identifiers are never stored in the clear.
  const { data: rows } = await admin
    .from("auth_attempts")
    .select("identifier_hash")
    .eq("identifier_hash", hashIdentifier(IDENTIFIER))
    .limit(1);
  check(
    "identifier is stored hashed, not in plaintext",
    !!rows?.[0] && rows[0].identifier_hash !== IDENTIFIER && /^[0-9a-f]{64}$/.test(rows[0].identifier_hash),
    `stored=${rows?.[0]?.identifier_hash}`,
  );

  await cleanup();
  await admin.from("auth_attempts").delete().eq("identifier_hash", hashIdentifier(cleanIdentifier));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
