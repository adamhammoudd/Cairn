// Signup consent (feature: Terms & Privacy consent on signup).
//
//   1. Pure  - the consent gate helper and the version constants.
//   2. Live  - the user_consents table exists with the shape the signup action
//              writes to it.
//
// The FK cascade (user_consents -> auth.users ON DELETE CASCADE) is asserted
// by the DDL in migration 0037 and exercised by the GDPR erasure suite's
// "every user_id column cascades" meta-check.
//
// Run: npm run test:signup-consent

import "./env";
import { createClient } from "@supabase/supabase-js";
import { consentGiven, legalDateDisplay, TOS_VERSION, PRIVACY_VERSION } from "@/lib/legal-versions";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

function fd(entries: Record<string, string>): Pick<FormData, "get"> {
  const map = new Map(Object.entries(entries));
  return { get: (k: string) => (map.has(k) ? (map.get(k) as string) : null) };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function runSignupConsentSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];

  // ---- pure: the gate ----
  cases.push(check("an absent consent field does not count as consent", consentGiven(fd({})) === false, "missing -> false"));
  cases.push(check('a checked box ("on") counts as consent', consentGiven(fd({ consent: "on" })) === true, '"on" -> true'));
  cases.push(
    check('"true"/"1" also count (programmatic client)', consentGiven(fd({ consent: "true" })) && consentGiven(fd({ consent: "1" })), "true/1 -> true"),
  );
  cases.push(
    check('an explicit "off"/"false" does not count', !consentGiven(fd({ consent: "false" })) && !consentGiven(fd({ consent: "off" })), "false/off -> false"),
  );

  // ---- pure: the versions ----
  cases.push(check("TOS_VERSION is an ISO date", ISO_DATE.test(TOS_VERSION), TOS_VERSION));
  cases.push(check("PRIVACY_VERSION is an ISO date", ISO_DATE.test(PRIVACY_VERSION), PRIVACY_VERSION));
  cases.push(
    check("legalDateDisplay renders the LegalShell 'Last updated' format", legalDateDisplay("2026-08-30") === "30 August 2026", legalDateDisplay("2026-08-30")),
  );

  // ---- live: the table ----
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cases.push({ name: "user_consents table shape", status: "skip", detail: "no SUPABASE_SERVICE_ROLE_KEY in env" });
    return { suiteName: "Signup consent", gating: true, cases };
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  // A real row read - a missing table or a missing column surfaces as an
  // error here (PGRST205 / 42703), which a `head:true` count can swallow.
  const probe = await admin
    .from("user_consents")
    .select("id, user_id, consented_at, tos_version, privacy_version, ip, user_agent, created_at")
    .limit(1);

  const ok = !probe.error && Array.isArray(probe.data);
  cases.push(
    check(
      "user_consents exists with every column the signup action writes",
      ok,
      ok
        ? `queryable, ${probe.data?.length ?? 0} row(s)`
        : (probe.error?.message ?? "no rows array") + " - migration 0037 not applied to this project yet",
    ),
  );

  return { suiteName: "Signup consent", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("signup-consent.ts")) {
  runSignupConsentSuite().then((suite) => {
    for (const c of suite.cases) {
      console.log(`${c.status === "pass" ? "pass " : c.status === "skip" ? "skip " : "FAIL "} ${c.name} - ${c.detail}`);
    }
    const failed = suite.cases.filter((c) => c.status === "fail").length;
    const ran = suite.cases.filter((c) => c.status !== "skip").length;
    console.log(`\n${suite.cases.filter((c) => c.status === "pass").length}/${ran} signup-consent cases passed`);
    process.exit(failed === 0 ? 0 : 1);
  });
}
