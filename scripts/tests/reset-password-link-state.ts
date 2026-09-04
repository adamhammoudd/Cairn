// Audit 2026-09-04 (medium): the reset-password page didn't distinguish an
// expired/used link from a valid one - it showed and enabled the new-password
// form regardless, so the user only learned the link was dead after typing a
// password and submitting.
//
// Fix: a checking / ready / invalid state machine; "invalid" renders a
// "request a new link" panel instead of the form.
//
// Run: npx tsx --conditions=react-server scripts/tests/reset-password-link-state.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dirname, "..", "..", "src/app/(auth)/reset-password/page.tsx"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

check("has a three-state link status", /"checking"\s*\|\s*"ready"\s*\|\s*"invalid"/.test(src));
check("a missing code resolves to invalid, not ready", /if \(!code\)[\s\S]{0,500}setStatus\("invalid"\)[\s\S]{0,120}return/.test(src));
check("a failed code exchange resolves to invalid", /exchangeCodeForSession\(code\)[\s\S]{0,160}setStatus\(err \? "invalid" : "ready"\)/.test(src));
check("invalid renders its own panel before the form", /if \(status === "invalid"\)[\s\S]{0,400}This reset link has expired/.test(src));
check("the invalid panel links to /forgot-password", /href="\/forgot-password"/.test(src));
check("the form's submit is gated on status === 'ready'", /disabled=\{status !== "ready" \|\| pending\}/.test(src));
check('no stale "ready" boolean remains', !/const \[ready, setReady\]/.test(src) && !/!ready \|\| pending/.test(src));

console.log(`\n${pass}/${pass + fail} reset-password-link-state cases passed`);
process.exit(fail === 0 ? 0 : 1);
