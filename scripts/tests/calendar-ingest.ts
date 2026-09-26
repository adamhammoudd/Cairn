// Regression test for fix/calendar-ingest.
//
// On 2026-09-26 calendar_events held two rows (ASML 2026-10-14, TSM
// 2026-10-15), so "Next event" was empty for every holding. The ingest ran
// daily and succeeded; it was built too narrow:
//   1. It fetched 21 days ahead. Most tracked companies report in late
//      October or November (NVDA 2026-11-18 on Nasdaq's own calendar), so a
//      21-day window was empty for them, while the scorecard looks 60 days out.
//   2. It kept only symbols on the market-data provider list, so a held stock
//      that is not on it (ISRG) could never get a date.
// The fix widens the window to the scorecard's horizon, tracks held and
// watched symbols, and, where Nasdaq has no date, adds an ESTIMATE from the
// company's own SEC filing history, labelled as one everywhere it is shown.
//
// Release histories below are the SEC 8-K item 2.02 dates stored in
// earnings_releases, live on 2026-09-26.
//
// Run: npx tsx --conditions=react-server scripts/tests/calendar-ingest.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { estimateNextEarnings, trackedSymbols, withEstimates } from "../../supabase/functions/_shared/earnings-estimate";
import { buildScorecard, nextEventDimension, THRESHOLDS } from "@/lib/scorecard";
import { upcomingEventsFromCalendar } from "@/lib/calendar";
import { buildBriefing, type BriefingHolding } from "@/lib/daily-briefing";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const here = path.dirname(fileURLToPath(import.meta.url));
const TODAY = "2026-09-26";

const RELEASES: Record<string, string[]> = {
  AMZN: ["2026-07-30", "2026-04-29", "2026-02-05", "2025-10-30", "2025-07-31", "2025-05-01", "2025-02-06", "2024-10-31", "2024-08-01", "2024-04-30", "2024-02-01", "2023-10-26", "2023-08-03"],
  ISRG: ["2026-07-16", "2026-04-21", "2026-01-22", "2026-01-14", "2025-10-21", "2025-07-22", "2025-04-22", "2025-01-23", "2025-01-15", "2024-10-17", "2024-07-18", "2024-04-18", "2024-01-23", "2024-01-09", "2023-10-19", "2023-07-20"],
  MSFT: ["2026-07-29", "2026-04-29", "2026-01-28", "2025-10-29", "2025-07-30", "2025-04-30", "2025-01-29", "2024-10-30", "2024-07-30", "2024-04-25", "2024-01-30", "2023-10-24", "2023-07-25"],
  NVDA: ["2026-08-26", "2026-05-20", "2026-02-25", "2025-11-19", "2025-08-27", "2025-05-28", "2025-02-26", "2024-11-20", "2024-08-28", "2024-05-22", "2024-02-21", "2023-11-21", "2023-08-23"],
};

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function runCalendarIngestSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ---- 1. the window --------------------------------------------------------------
  const src = fs.readFileSync(path.join(here, "..", "..", "supabase", "functions", "ingest-calendar", "index.ts"), "utf8");
  const daysAhead = Number(/const DAYS_AHEAD = (\d+);/.exec(src)?.[1]);
  check(
    "ingest-calendar fetches as far ahead as the scorecard looks for a next event",
    daysAhead >= THRESHOLDS.nextEvent.horizonDays,
    `DAYS_AHEAD=${daysAhead}, scorecard horizon=${THRESHOLDS.nextEvent.horizonDays}`,
  );
  // Nasdaq's own calendar had NVDA on 2026-11-18 (checked 2026-09-26): 53 days out.
  check("NVDA's confirmed 2026-11-18 date is inside the window", days(TODAY, "2026-11-18") <= daysAhead, `${days(TODAY, "2026-11-18")} days vs DAYS_AHEAD=${daysAhead}`);

  // ---- 2. which symbols ------------------------------------------------------------
  const tracked = trackedSymbols(
    [{ config: { symbols: ["AAPL", "msft", { symbol: "SPY", asset_type: "etf" }] } }, { config: null }],
    [{ symbol: "ISRG" }, { symbol: "nvda" }],
    [{ symbol: "CRWD" }],
  );
  check(
    "held (ISRG) and watched (CRWD) symbols are tracked, not only the provider list",
    ["AAPL", "MSFT", "SPY", "ISRG", "NVDA", "CRWD"].every((s) => tracked.has(s)),
    [...tracked].join(","),
  );

  // ---- 3. estimates from SEC filing history --------------------------------------
  const expected: Record<string, string> = { ISRG: "2026-10-20", MSFT: "2026-10-28", AMZN: "2026-10-29", NVDA: "2026-11-18" };
  for (const [sym, want] of Object.entries(expected)) {
    const e = estimateNextEarnings(RELEASES[sym], TODAY, 60);
    check(`${sym}: next results estimated at ${want} (same quarter last year + 52 weeks)`, e?.date === want, JSON.stringify(e));
  }
  const nv = estimateNextEarnings(RELEASES.NVDA, TODAY, 60);
  check("NVDA's estimate matches the date Nasdaq has confirmed (2026-11-18)", nv?.date === "2026-11-18", `${nv?.date}`);
  check(
    "the estimate says how far off this method has been for the company",
    typeof nv?.typicalErrorDays === "number" && nv.typicalErrorDays <= 7 && nv.basedOn === "2025-11-19",
    JSON.stringify(nv),
  );
  const justReported = estimateNextEarnings(RELEASES.ISRG, "2026-07-20", 60);
  check(
    "no estimate for a quarter that was already reported (ISRG reported 2026-07-16; last year's 07-22 projects to 07-21)",
    justReported === null,
    JSON.stringify(justReported),
  );
  check("no history, no estimate", estimateNextEarnings([], TODAY, 60) === null, "null");
  check("an estimate past the window is not made", estimateNextEarnings(RELEASES.NVDA, TODAY, 21) === null, "21-day window");

  // ---- 4. Nasdaq wins where it has a date -----------------------------------------
  const merged = withEstimates(
    [{ symbol: "NVDA", event_type: "earnings", event_date: "2026-11-18", title: "NVIDIA - quarterly earnings", metadata: { source: "nasdaq" } }],
    { NVDA: RELEASES.NVDA, MSFT: RELEASES.MSFT },
    TODAY,
    60,
  );
  const msft = merged.find((e) => e.symbol === "MSFT");
  check(
    "an estimate is added only where Nasdaq has no earnings date (NVDA: Nasdaq only; MSFT: estimate)",
    merged.filter((e) => e.symbol === "NVDA").length === 1 && msft?.metadata.source === "sec_estimate" && msft.metadata.confirmed === false,
    JSON.stringify(merged),
  );

  // ---- 5. labelled as an estimate where it is shown -------------------------------
  const events = upcomingEventsFromCalendar([
    { event_type: "earnings", event_date: "2026-10-28", title: "Microsoft - quarterly earnings (estimated)", metadata: msft!.metadata },
  ]);
  const dim = nextEventDimension(TODAY, events, []);
  check(
    "scorecard: an estimated date says so in the verdict, the sentence and the source",
    /estimated/i.test(dim.verdict) && /estimate/i.test(dim.sentence) && /SEC/.test(dim.sources[0]?.label ?? "") && !/Nasdaq/.test(dim.sources[0]?.label ?? ""),
    `${dim.verdict} | ${dim.sentence} | ${dim.sources[0]?.label}`,
  );
  const confirmed = nextEventDimension(TODAY, upcomingEventsFromCalendar([{ event_type: "earnings", event_date: "2026-11-18", title: "NVIDIA - quarterly earnings", metadata: { source: "nasdaq" } }]), []);
  check(
    "scorecard: a Nasdaq date reads as before, without 'estimated'",
    confirmed.verdict === "Earnings in 53 days" && /Nasdaq calendar/.test(confirmed.sources[0]?.label ?? ""),
    `${confirmed.verdict} | ${confirmed.sources[0]?.label}`,
  );

  const holding = (symbol: string, estimated: boolean): BriefingHolding => ({
    symbol,
    name: symbol,
    assetType: "equity",
    quantity: 1,
    value: 100,
    pricesAsc: [],
    scorecard: buildScorecard({
      symbol,
      assetType: "equity",
      today: TODAY,
      companyData: "unavailable",
      metrics: null,
      valuation: { pe: null, sector: null, fcfYield: null, priceDate: null, filing: null },
      dividend: { perShareTtm: null, price: null, payoutOfFcf: null, freeCashFlow: null, growthYears: null, filing: null },
      trend: { return6m: null, vs200d: null, asOf: null },
      events: [],
      reactions: [],
      filing: null,
    }),
    scorecardWeekAgo: null,
    reactions: [],
    dividends: null,
    events: [{ type: "earnings", date: "2026-10-01", estimated }],
  });
  const b = buildBriefing({ today: TODAY, holdings: [holding("ISRG", true), holding("MSFT", false)], exposureEnabled: false });
  const isrg = b.comingUp.find((r) => r.symbol === "ISRG");
  const ms = b.comingUp.find((r) => r.symbol === "MSFT");
  check(
    "briefing 'Coming up': an estimated date is labelled, a confirmed one is not",
    !!isrg && /estimated/i.test(isrg.title) && !!ms && !/estimated/i.test(ms.title),
    `${isrg?.title} | ${ms?.title}`,
  );
  const card = b.cards.find((c) => c.symbol === "ISRG");
  check("briefing card for an estimated date says 'expected around', not 'due'", !!card && /expected around/i.test(card.body.join(" ")), card?.body.join(" ") ?? "no card");

  return { suiteName: "Calendar ingest (window, symbols, SEC estimates)", gating: true, cases };
}

function main() {
  const suite = runCalendarIngestSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
