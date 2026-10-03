// Suites that inspect the LIVE database (stored analyses, real schema) cannot
// run without credentials. They used to construct a Supabase client anyway and
// die with "supabaseUrl is required", reported as a failure with a stack trace
// (audit 2026-10-02, item 4.1). A suite that did not run has told you nothing, so
// it now says so, in plain words, as a SKIP - which run-all reports as
// INCOMPLETE (exit 2), never as a pass.
import type { SuiteResult } from "./report";

export function hasLiveDb(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function liveDbSkipped(suiteName: string, what: string, gating = true): SuiteResult {
  return {
    suiteName,
    gating,
    cases: [
      {
        name: `${what} (needs the live database)`,
        status: "skip",
        detail:
          "Not run: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set, so there are no stored analyses to inspect. Put them in .env.local to run this suite against your own database. This is a skip, not a pass.",
      },
    ],
  };
}
