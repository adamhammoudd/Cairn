// The waitlist gate's allowlist (src/lib/public-paths.ts, used by src/proxy.ts).
//
// Regression cover for the production break where `/waitlist/confirm` - the
// target of the link in every confirmation email - was redirected to
// `/waitlist` before its page could run, so no signup could be confirmed. The
// allowlist was an exact `Array.includes(pathname)` check and `/waitlist/confirm`
// was not in it.
//
// Pure and DB-free. Run: npm run test:proxy-paths

import { isPublicPath } from "@/lib/public-paths";
import type { SuiteResult, TestCase } from "./report";

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
