// Audit 2026-10-02 item 2.5: a nonce-based Content-Security-Policy, built and
// wired but NOT switched on. CSP_MODE (unset / report-only / enforce) is Adam's
// switch; with it unset nothing changes.
//
// Run: npx tsx --conditions=react-server scripts/tests/csp-nonce.ts

import fs from "node:fs";
import path from "node:path";
import { buildCsp, cspHeaderName, newNonce, readCspMode } from "../../src/lib/csp";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

export function runCspNonceSuite(): SuiteResult {
  const { check, result } = makeSuite("CSP nonce policy (built, switch left to Adam)");

  // Before: the static policy in next.config.ts allows inline script.
  const cfg = read("next.config.ts");
  check("(before) the static policy's script-src still lists 'unsafe-inline'", /script-src 'self' 'unsafe-inline'/.test(cfg));

  const n1 = newNonce();
  const n2 = newNonce();
  check("nonces are unique and at least 128 bits", n1 !== n2 && atob(n1).length >= 16, `${n1} / ${n2}`);

  const prod = buildCsp({ nonce: n1, isDev: false, supabaseOrigin: "https://abc.supabase.co" });
  const script = directive(prod, "script-src");
  check("script-src carries the nonce and 'strict-dynamic'", script.includes(`'nonce-${n1}'`) && script.includes("'strict-dynamic'"), script);
  check("script-src has NO 'unsafe-inline' and no 'unsafe-eval' in production", !script.includes("'unsafe-inline'") && !script.includes("'unsafe-eval'"), script);
  check("dev allows 'unsafe-eval' only for the dev server", directive(buildCsp({ nonce: n1, isDev: true, supabaseOrigin: "" }), "script-src").includes("'unsafe-eval'"));
  check("hCaptcha stays allowed (script, frame, connect)", /hcaptcha\.com/.test(script) && /hcaptcha\.com/.test(directive(prod, "frame-src")) && /hcaptcha\.com/.test(directive(prod, "connect-src")));
  check("Supabase (https and wss) stays allowed in connect-src", directive(prod, "connect-src").includes("https://abc.supabase.co") && directive(prod, "connect-src").includes("wss://abc.supabase.co"));
  check("framing, base-uri, form-action and object-src stay locked down", ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].every((d) => prod.includes(d)));
  check("two policies built for two requests differ only by nonce", buildCsp({ nonce: "A", isDev: false, supabaseOrigin: "" }).replace("A", "B") === buildCsp({ nonce: "B", isDev: false, supabaseOrigin: "" }));

  // The switch.
  check("CSP_MODE unset -> off", readCspMode({}) === null);
  check("CSP_MODE=report-only -> report-only header", readCspMode({ CSP_MODE: "report-only" }) === "report-only" && cspHeaderName("report-only") === "Content-Security-Policy-Report-Only");
  check("CSP_MODE=enforce -> enforcing header", readCspMode({ CSP_MODE: "Enforce" }) === "enforce" && cspHeaderName("enforce") === "Content-Security-Policy");
  check("any other value is treated as off, never as enforcing", readCspMode({ CSP_MODE: "on" }) === null && readCspMode({ CSP_MODE: "true" }) === null);

  // Wiring.
  const proxy = read("src/proxy.ts");
  check("the proxy sets the nonce and the policy on the request (so Next puts the nonce on its scripts) and on the response", /headers\.set\("x-nonce", nonce\)/.test(proxy) && /headers\.set\(cspHeaderName\(cspMode\)\.toLowerCase\(\), csp\)/.test(proxy) && /res\.headers\.set\(cspHeaderName\(cspMode\), csp\)/.test(proxy));
  check("the proxy builds responses through next() everywhere, including after a cookie refresh", !/response = NextResponse\.next\(\{ request \}\)/.test(proxy) && (proxy.match(/= next\(\)/g) ?? []).length >= 2);
  check("with CSP_MODE set the static policy is dropped (the two never stack)", /nonceCspActive \? \[\] : \[\{ key: "Content-Security-Policy-Report-Only"/.test(cfg));
  check("nothing is enforcing by default: next.config.ts has no enforcing CSP header", !/key: "Content-Security-Policy"/.test(cfg));
  return result();
}

void runIfMain(import.meta.url, runCspNonceSuite);
