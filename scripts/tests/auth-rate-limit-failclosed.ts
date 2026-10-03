// Audit 2026-10-02 item 2.4: the credential rate limiter.
//  * AUTH_HASH_SALT is required: no fallback to the service-role key or a
//    public constant, and missing fails loudly.
//  * A database error fails CLOSED for sign-in (and logs), open for the rest.
//  * An error returned by the database (not thrown) is no longer read as zero.
// No database: the limiter's store is injected.
//
// Run: npx tsx --conditions=react-server scripts/tests/auth-rate-limit-failclosed.ts

import fs from "node:fs";
import path from "node:path";
import { checkAuthRateLimit, recordAuthAttempt, requireAuthHashSalt, type RateLimitDb } from "../../src/lib/auth-rate-limit";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

export async function runAuthRateLimitFailClosedSuite(): Promise<SuiteResult> {
  const { check, result } = makeSuite("Auth rate limit (required salt, fails closed on a database error)");
  const saved = process.env.AUTH_HASH_SALT;
  const logged: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));

  try {
    // ---- salt ----
    let threw = "";
    try { requireAuthHashSalt({}); } catch (e) { threw = String(e); }
    check("missing AUTH_HASH_SALT throws, naming the variable", /AUTH_HASH_SALT/.test(threw), threw.slice(0, 80));
    threw = "";
    try { requireAuthHashSalt({ AUTH_HASH_SALT: "short" }); } catch (e) { threw = String(e); }
    check("a short salt is refused", threw.length > 0);
    check("the service-role key is NOT accepted as a salt", (() => { try { requireAuthHashSalt({ SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40) }); return false; } catch { return true; } })());
    check("a 16+ character salt is accepted", requireAuthHashSalt({ AUTH_HASH_SALT: "a-long-random-salt" }) === "a-long-random-salt");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/lib/auth-rate-limit.ts"), "utf8").split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
    check("no literal fallback salt or service-role fallback remains in the module", !/cairn-dev-salt/.test(src) && !/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(src));
    check("a startup hook requires the salt in production", /requireAuthHashSalt\(\)/.test(fs.readFileSync(path.resolve(__dirname, "../../src/instrumentation.ts"), "utf8")));

    // ---- fail closed ----
    process.env.AUTH_HASH_SALT = "test-salt-test-salt-1234";
    const broken: RateLimitDb = {
      countFailures: async () => { throw new Error("connection refused"); },
      insertAttempts: async () => { throw new Error("connection refused"); },
    };
    const signIn = await checkAuthRateLimit("a@b.invalid", "sign_in", "203.0.113.9", broken);
    check("sign-in with the attempt log unreadable is refused", signIn.allowed === false);
    check("the refusal is a plain message that does not mention the account", !!signIn.message && !/a@b\.invalid|exist/i.test(signIn.message), signIn.message);
    check("the failure is logged with no email or IP in it", logged.some((l) => /auth rate limit \(sign_in\)/.test(l)) && !logged.some((l) => /a@b\.invalid|203\.0\.113\.9/.test(l)), logged[0] ?? "");
    const reset = await checkAuthRateLimit("a@b.invalid", "password_reset", null, broken);
    check("password reset still allowed on a log outage (and logged)", reset.allowed === true && logged.some((l) => /password_reset/.test(l)));

    // ---- healthy paths unchanged ----
    const counts = new Map<string, number>();
    const healthy: RateLimitDb = {
      countFailures: async (h) => counts.get(h) ?? 0,
      insertAttempts: async (rows) => { for (const r of rows) if (!r.succeeded) counts.set(r.identifier_hash, (counts.get(r.identifier_hash) ?? 0) + 1); },
    };
    check("under the limit: allowed", (await checkAuthRateLimit("c@d.invalid", "sign_in", null, healthy)).allowed);
    for (let i = 0; i < 5; i++) await recordAuthAttempt("c@d.invalid", "sign_in", false, null, healthy);
    check("5 failures in the window: blocked", (await checkAuthRateLimit("c@d.invalid", "sign_in", null, healthy)).allowed === false);
    check("a different account is unaffected", (await checkAuthRateLimit("e@f.invalid", "sign_in", null, healthy)).allowed);

    // recording failure is logged, never thrown
    logged.length = 0;
    await recordAuthAttempt("g@h.invalid", "sign_in", false, null, broken);
    check("a failed attempt write is logged, not thrown", logged.some((l) => /could not record/.test(l)));
  } finally {
    console.error = origErr;
    if (saved === undefined) delete process.env.AUTH_HASH_SALT;
    else process.env.AUTH_HASH_SALT = saved;
  }
  return result();
}

void runIfMain(import.meta.url, runAuthRateLimitFailClosedSuite);
