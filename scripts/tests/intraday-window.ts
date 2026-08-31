// Unit test for the intraday chart windowing (src/lib/intraday-window.ts).
//
// The behaviour under test is the closed-market fallback: when the newest bar
// the provider returns is days old (weekend, holiday, after hours), the chart
// must still render that last session - the way Yahoo Finance does - rather
// than filtering everything out and showing "No intraday bars for this range".
//
// Run: npm run test:intraday-window

import { RANGES, sessionWindow, windowBars } from "@/lib/intraday-window";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** A run of bars every `stepMin` minutes, ending at `end`. */
function bars(end: number, count: number, stepMin: number) {
  return Array.from({ length: count }, (_, i) => ({
    ts: new Date(end - (count - 1 - i) * stepMin * 60_000).toISOString(),
    close: 100 + i,
  }));
}

export function runIntradayWindowSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // Friday 20:00 UTC close; "now" is the following Sunday 15:00 UTC.
  const fridayClose = Date.UTC(2026, 7, 28, 20, 0);
  const sundayNow = Date.UTC(2026, 7, 30, 15, 0);

  // ---- 1D over a closed market ----
  const fridaySession = bars(fridayClose, 390, 1); // ~1 trading day of 1-min bars
  const d1 = windowBars(fridaySession, "1D", RANGES["1D"].spanMs, sundayNow);
  cases.push(check("1D keeps the last session's bars when the market is closed", d1.points.length > 300, `${d1.points.length} points`));
  cases.push(check("1D flags the feed stale", d1.stale === true, String(d1.stale)));
  cases.push(check("1D reports asOf = the last bar's UTC date", d1.asOf === "2026-08-28", String(d1.asOf)));
  cases.push(
    check(
      "1D collapses to a single calendar day",
      new Set(d1.points.map((p) => p.date.slice(0, 10))).size === 1,
      JSON.stringify([...new Set(d1.points.map((p) => p.date.slice(0, 10)))]),
    ),
  );

  // ---- 1W over a closed market ----
  const week = bars(fridayClose, 400, 15); // ~5 sessions of 15-min bars
  const w1 = windowBars(week, "1W", RANGES["1W"].spanMs, sundayNow);
  cases.push(check("1W keeps a multi-day window when the market is closed", w1.points.length > 100, `${w1.points.length} points`));
  cases.push(check("1W flags the feed stale", w1.stale === true, String(w1.stale)));

  // ---- live market: nothing changes ----
  const liveNow = fridayClose + 5 * 60_000; // 5 minutes after the last bar
  const live = windowBars(fridaySession, "1D", RANGES["1D"].spanMs, liveNow);
  cases.push(check("a fresh feed is not flagged stale", live.stale === false, String(live.stale)));
  cases.push(check("a fresh feed keeps its bars", live.points.length > 300, `${live.points.length} points`));

  // ---- empty provider response ----
  const none = windowBars([], "1D", RANGES["1D"].spanMs, sundayNow);
  cases.push(check("no bars in -> no points, not stale, no asOf", none.points.length === 0 && !none.stale && none.asOf === null, JSON.stringify(none)));

  // ---- future bars are never shown ----
  const withFuture = [...fridaySession, { ts: new Date(sundayNow + DAY).toISOString(), close: 999 }];
  const clipped = windowBars(withFuture, "1D", RANGES["1D"].spanMs, sundayNow);
  cases.push(check("a bar dated in the future is dropped", !clipped.points.some((p) => p.value === 999), `${clipped.points.length} points`));

  // ---- sessionWindow: shared multi-symbol anchor ----
  const sw = sessionWindow([fridayClose - DAY, fridayClose], "1W", RANGES["1W"].spanMs, sundayNow);
  cases.push(check("sessionWindow keeps a bar from the last session", sw.keep(fridayClose) === true, "kept"));
  cases.push(check("sessionWindow drops a bar outside the span", sw.keep(fridayClose - 30 * DAY) === false, "dropped"));
  cases.push(check("sessionWindow reports the shared asOf date", sw.asOf === "2026-08-28", String(sw.asOf)));

  return { suiteName: "Intraday chart windowing (closed-market fallback)", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("intraday-window.ts")) {
  const suite = runIntradayWindowSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} intraday-window cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
