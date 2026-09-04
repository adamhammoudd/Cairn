// Audit 2026-09-04, finding #9: every authenticated page made three separate,
// non-deduplicated calls to Supabase's Auth server for the same "who is this
// user" answer - once in (app)/layout.tsx, once inside getUserPlan(), once
// inside getDisplayPrefs(). supabase.auth.getUser() is a network round-trip to
// GoTrue every call.
//
// Fix: a single request-memoised getAuthUser() (React cache()). This is a
// structural lock that the read paths route through it and no longer call
// auth.getUser() themselves.
//
// Run: npx tsx --conditions=react-server scripts/tests/auth-dedup.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- the memoised helper -------------------------------------------------
const helper = read("src/lib/supabase/auth.ts");
check("getAuthUser is wrapped in React cache()", /export const getAuthUser = cache\(/.test(helper));
check("getAuthUser validates against the Auth server", /auth\.getUser\(\)/.test(helper));

// --- the layout no longer calls auth.getUser() itself ------------------
const layout = read("src/app/(app)/layout.tsx");
check("(app)/layout.tsx uses getAuthUser()", /getAuthUser\(\)/.test(layout));
check("(app)/layout.tsx does not call supabase.auth.getUser() directly", !/auth\.getUser\(/.test(layout));

// --- the two functions the layout calls in parallel -------------------
const displayPrefs = read("src/lib/actions/display-prefs.ts");
check("getDisplayPrefs uses getAuthUser()", /getAuthUser\(\)/.test(displayPrefs));
check("getDisplayPrefs does not call supabase.auth.getUser() directly", !/auth\.getUser\(/.test(displayPrefs));

const billing = read("src/lib/actions/billing.ts");
for (const fn of ["getUserPlan", "getBillingSummary", "getChatUsageSummary", "getBillingDetail"]) {
  const start = billing.indexOf(`export async function ${fn}(`);
  const body = billing.slice(start, start + 700);
  check(`billing.${fn} uses getAuthUser()`, /getAuthUser\(\)/.test(body), "not routed through the memoised helper");
  check(`billing.${fn} does not call supabase.auth.getUser() directly`, !/supabase\.auth\.getUser\(/.test(body));
}

console.log(`\n${pass}/${pass + fail} auth-dedup cases passed`);
process.exit(fail === 0 ? 0 : 1);
