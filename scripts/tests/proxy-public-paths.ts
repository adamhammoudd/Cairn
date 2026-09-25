// The waitlist gate's allowlist (src/lib/public-paths.ts, used by src/proxy.ts).
//
// Regression cover for two production breaks with the same root cause - the
// middleware bouncing a path to `/waitlist` before its handler could run:
//   1. `/waitlist/confirm` (the confirmation-email link) was missing from the
//      allowlist, so no signup could ever be confirmed.
//   2. `/robots.txt` was not in the middleware matcher's exclusions, so it 307'd
//      to `/waitlist` and there was effectively no robots.txt in production -
//      which made the pre-launch `Disallow: /` meaningless.
//
// Pure and DB-free. Run: npm run test:proxy-paths

import { readFileSync } from "node:fs";
import { isPublicPath } from "@/lib/public-paths";
import { config as proxyConfig } from "@/proxy";
import type { SuiteResult, TestCase } from "./report";

// The middleware matcher is a single regex string (Next only static-analyses a
// literal). A path that matches => the middleware runs on it; a path that does
// not match => Next serves it without the middleware ever seeing it.
const matcher = new RegExp(proxyConfig.matcher[0]);

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

/**
 * Is the gate actually switched on?
 *
 * Everything else in this suite tests the allowlist - which paths *would* be
 * let through. None of it notices if the redirect that enforces the allowlist
 * is commented out, and that is exactly what happened: proxy.ts sat in the
 * working tree with the `if (!user && !isPublicPath(...))` block wrapped in a
 * block comment, so locally the entire app was open while production still had
 * the gate. An allowlist with no gate behind it passes every other assertion
 * here perfectly.
 *
 * Reads the source rather than invoking proxy(), because calling it needs a
 * NextRequest and a live Supabase session and this suite is deliberately
 * DB-free.
 */
function gateIsEnabled(): { ok: boolean; detail: string } {
  let source: string;
  try {
    source = readFileSync(new URL("../../src/proxy.ts", import.meta.url), "utf8");
  } catch {
    return { ok: false, detail: "could not read src/proxy.ts" };
  }

  // Strip block and line comments, then look for the redirect. If it only
  // survives in the raw source it is commented out.
  const uncommented = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const hasRedirect = /NextResponse\s*\.\s*redirect/.test(uncommented);
  const hasGuard = /isPublicPath\s*\(/.test(uncommented);

  if (hasRedirect && hasGuard) return { ok: true, detail: "" };
  return {
    ok: false,
    detail: "the waitlist gate in src/proxy.ts is commented out - the app is open to anonymous visitors",
  };
}

export function runProxyPublicPathsSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // --- the gate itself ---
  const gate = gateIsEnabled();
  cases.push(check("the waitlist gate redirect is live (not commented out)", gate.ok, gate.detail));

  // --- must be reachable without a session ---
  cases.push(
    check(
      "/waitlist/confirm is public (the confirmation-email link target)",
      isPublicPath("/waitlist/confirm") === true,
      "this is the path that was broken",
    ),
  );
  cases.push(check("/waitlist itself is public", isPublicPath("/waitlist") === true, ""));
  cases.push(
    check(
      "the legal pages are public",
      ["/privacy", "/terms", "/accessibility"].every((p) => isPublicPath(p)),
      "",
    ),
  );
  // Legally mandated disclosures. /legal-notice carries the trader identity the
  // e-Commerce Directive requires to be permanently accessible, and /refunds
  // carries the withdrawal and cancellation terms that have to be available
  // before a consumer is bound. Behind the gate they may as well not exist.
  cases.push(
    check(
      "/legal-notice and /refunds are public (they are legally required to be)",
      isPublicPath("/legal-notice") === true && isPublicPath("/refunds") === true,
      "",
    ),
  );
  // The landing page is where the app layout sends every logged-out visitor.
  // If it ever stops being public the gate bounces it to /waitlist and the
  // redirect loops.
  cases.push(check("/welcome (the landing page) is public", isPublicPath("/welcome") === true, ""));
  cases.push(
    check(
      "/welcome matches exactly (/welcome-back is NOT public)",
      isPublicPath("/welcome-back") === false,
      "",
    ),
  );
  cases.push(
    check(
      "/api routes are public at the gate (they do their own auth)",
      isPublicPath("/api/stripe/webhook") === true && isPublicPath("/api") === true,
      "",
    ),
  );

  // --- robots.txt / sitemap.xml: reachable, and the middleware never runs ---
  cases.push(
    check(
      "/robots.txt is excluded from the middleware matcher",
      matcher.test("/robots.txt") === false,
      "the fault that made it 307 to /waitlist",
    ),
  );
  cases.push(
    check("/sitemap.xml is excluded from the middleware matcher", matcher.test("/sitemap.xml") === false, ""),
  );
  cases.push(
    check(
      "/robots.txt and /sitemap.xml are also public at the gate (second layer)",
      isPublicPath("/robots.txt") === true && isPublicPath("/sitemap.xml") === true,
      "",
    ),
  );
  cases.push(
    check(
      "/llms.txt, /site.webmanifest and the generated /opengraph-image are excluded from the matcher",
      ["/llms.txt", "/site.webmanifest", "/opengraph-image", "/opengraph-image-abc123"].every((p) => matcher.test(p) === false),
      "the gate would 307 them to /waitlist",
    ),
  );
  cases.push(
    check(
      "/llms.txt, /site.webmanifest and /opengraph-image are also public at the gate (second layer)",
      ["/llms.txt", "/site.webmanifest", "/opengraph-image", "/opengraph-image-abc123"].every((p) => isPublicPath(p)),
      "",
    ),
  );
  cases.push(
    check(
      "favicon.ico and static images are still matcher-excluded",
      matcher.test("/favicon.ico") === false && matcher.test("/logo.png") === false,
      "",
    ),
  );
  cases.push(
    check(
      "gated app routes still hit the middleware",
      matcher.test("/") === true && matcher.test("/portfolio") === true && matcher.test("/waitlist/confirm") === true,
      "",
    ),
  );

  // --- must still be gated ---
  cases.push(check("/ (dashboard) stays gated", isPublicPath("/") === false, ""));
  cases.push(check("/signup stays gated (new accounts come via the waitlist)", isPublicPath("/signup") === false, ""));
  // Beta users must be able to sign back in and reset a password while logged
  // out - gating these locked people out of their own accounts.
  cases.push(check("/login is public", isPublicPath("/login") === true, ""));
  cases.push(check("/forgot-password is public", isPublicPath("/forgot-password") === true, ""));
  cases.push(check("/reset-password is public", isPublicPath("/reset-password") === true, ""));
  cases.push(check("/portfolio stays gated", isPublicPath("/portfolio") === false, ""));
  cases.push(
    check(
      "the /waitlist prefix is boundary-aware (/waitlistings is NOT public)",
      isPublicPath("/waitlistings") === false,
      "",
    ),
  );
  cases.push(
    check(
      "legal pages match exactly (/privacy-nope is NOT public)",
      isPublicPath("/privacy-nope") === false,
      "",
    ),
  );
  cases.push(
    check(
      "the /api match is boundary-aware (/apidocs is NOT public)",
      isPublicPath("/apidocs") === false,
      "",
    ),
  );

  return {
    suiteName: "Waitlist gate allowlist (proxy public paths)",
    gating: true,
    cases,
  };
}

if (process.argv[1] && process.argv[1].endsWith("proxy-public-paths.ts")) {
  const suite = runProxyPublicPathsSuite();
  for (const c of suite.cases) {
    console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name}${c.detail ? ` - ${c.detail}` : ""}`);
  }
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} proxy-public-paths cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
