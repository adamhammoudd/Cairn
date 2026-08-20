// Tests for src/lib/market-hours.ts.
//
// The dashboard used to render the literal string "markets open" regardless of
// the time, so these cases are mostly about the times it was previously wrong:
// weekends, holidays, and either side of the session.
//
// Every timestamp below is written in UTC with the New York wall clock stated
// in the case name, which is also what makes the DST pair meaningful - the
// same 14:00 UTC is pre-market in January and open in July.

import { getMarketStatus } from "../../src/lib/market-hours";
import type { SuiteResult, TestCase } from "./report";

const cases: TestCase[] = [];

function check(name: string, iso: string, expectedPhase: string) {
  const actual = getMarketStatus(new Date(iso));
  const ok = actual.phase === expectedPhase;
  cases.push({
    name,
    status: ok ? "pass" : "fail",
    detail: ok ? `${actual.phase} ("${actual.label}")` : `expected ${expectedPhase}, got ${actual.phase}`,
  });
}

// --- the specific bug: a confident "markets open" at impossible times -------
check("Sunday 03:00 ET is not open", "2026-08-16T07:00:00Z", "weekend");
check("Saturday midday ET is not open", "2026-08-15T16:00:00Z", "weekend");
check("Christmas Day 2026 (a Friday) is a holiday", "2026-12-25T15:00:00Z", "holiday");
check("Thanksgiving 2026 is a holiday", "2026-11-26T15:00:00Z", "holiday");
check("Independence Day observed 2026-07-03 is a holiday", "2026-07-03T15:00:00Z", "holiday");

// --- session boundaries, EDT (UTC-4) ---------------------------------------
check("09:29 ET is pre-market, not open", "2026-08-20T13:29:00Z", "pre");
check("09:30 ET is open on the minute", "2026-08-20T13:30:00Z", "open");
check("12:00 ET is open", "2026-08-20T16:00:00Z", "open");
check("15:59 ET is still open", "2026-08-20T19:59:00Z", "open");
check("16:00 ET is after hours, not open", "2026-08-20T20:00:00Z", "after");
check("21:00 ET is closed", "2026-08-21T01:00:00Z", "closed");
check("03:00 ET is closed, before pre-market", "2026-08-20T07:00:00Z", "closed");
check("05:00 ET is pre-market", "2026-08-20T09:00:00Z", "pre");

// --- DST: the same UTC instant is a different session in winter ------------
check("14:00 UTC in January is 09:00 EST = pre-market", "2026-01-15T14:00:00Z", "pre");
check("14:00 UTC in July is 10:00 EDT = open", "2026-07-15T14:00:00Z", "open");
check("14:30 UTC in January is 09:30 EST = open", "2026-01-15T14:30:00Z", "open");

// --- midnight boundary, where hour12:false can report "24" -----------------
check("midnight ET is closed, not open", "2026-08-20T04:00:00Z", "closed");

export function runMarketHoursSuite(): SuiteResult {
  return { suiteName: "Market hours", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("market-hours.ts")) {
  for (const c of cases) console.log(`${c.status === "pass" ? "ok  " : "FAIL"} ${c.name} - ${c.detail}`);
  const failed = cases.filter((c) => c.status === "fail").length;
  console.log(`\n${cases.length - failed}/${cases.length} market-hours cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
