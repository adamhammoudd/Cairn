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

export function runProxyPublicPathsSuite(): SuiteResult {
  const cases: TestCase[] = [];

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
      "the three legal pages are public",
      ["/privacy", "/terms", "/accessibility"].every((p) => isPublicPath(p)),
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
  cases.push(check("/login stays gated", isPublicPath("/login") === false, ""));
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
