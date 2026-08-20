// Caller authentication for the scheduled Edge Functions.
//
// These are all deployed --no-verify-jwt so pg_cron can invoke them without
// presenting a user token (supabase/README.md). That flag removes the *only*
// authentication in front of them: every ingestion function and the briefing
// generator have been callable by anyone on the internet, from any origin,
// with an empty POST. The cost of that is not theoretical - each invocation
// fans out to Yahoo, CoinGecko, SEC EDGAR and Nasdaq, so an attacker can burn
// the project's standing with the upstream providers (all keyless, all
// IP-rate-limited) and generate-daily-briefings writes rows for every user.
//
// The fix keeps --no-verify-jwt (pg_cron still has no user identity) and adds
// a shared secret the scheduler sends and the function checks.
//
// The secret is NOT in this repository. Set it in both places out of band:
//
//   supabase secrets set CRON_SECRET=<random>
//   alter database postgres set app.settings.cron_secret = '<same random>';
//
// The cron migrations read it with current_setting(), so the committed SQL
// carries the reference and never the value.

export function cronSecretConfigured(): boolean {
  return Boolean(Deno.env.get("CRON_SECRET"));
}

/**
 * Returns a 401 Response when the caller does not present the shared secret,
 * or null when the request may proceed.
 *
 * Fails CLOSED when CRON_SECRET is unset. The alternative - treating "no
 * secret configured" as "no auth required" - means a deployment that forgets
 * the secret silently reverts to the wide-open behaviour this exists to end,
 * and nothing in the response would say so.
 */
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");

  if (!expected) {
    return Response.json(
      { error: "CRON_SECRET is not configured for this function; refusing to run unauthenticated." },
      { status: 503 },
    );
  }

  const presented = req.headers.get("x-cairn-cron-secret");
  if (!presented || !timingSafeEqual(presented, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

// Constant-time comparison. A byte-by-byte early return leaks the secret one
// character at a time to anyone willing to time the responses.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Length is compared without early return as well, by folding it into the
  // accumulator rather than branching on it.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
