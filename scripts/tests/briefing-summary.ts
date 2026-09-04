// Unit test for composeBriefingSummary (src/lib/ai/briefing.ts).
//
// The last scan found briefings substantively thin - a body that was one line
// about an upcoming dividend. Two gaps caused that: the generator never looked
// at price movement at all, and news was only included when the reader had set
// a category filter (the default is none). This checks the summary now
// surfaces price moves and holding/watchlist news, and still degrades honestly
// when there genuinely is nothing.
//
// Run: npm run test:briefing-summary

import { composeBriefingSummary, dedupeLatestPerSymbol } from "@/lib/ai/briefing";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const move = (symbol: string, change_pct: number) => ({ symbol, change_pct, close: 100, as_of: "2026-08-28" });
const analysis = (scope_value: string) => ({
  id: scope_value,
  scope_value,
  analysis_type: "ticker",
  probability_low: 20,
  probability_high: 30,
  confidence_level: "medium",
});
const story = (id: string) => ({ id, title: `Story ${id}`, source_name: "Wire", published_at: "2026-08-30", tickers: ["NVDA"] });

export function runBriefingSummarySuite(): SuiteResult {
  const cases: TestCase[] = [];
  const empty = { priceMoves: [], analyses: [], events: [], symbolNews: [], news: [] };

  cases.push(
    check(
      "no tracked symbols -> the add-symbols prompt",
      composeBriefingSummary({ symbolCount: 0, includeHoldings: true, ...empty }).includes("add some"),
      "prompt shown",
    ),
  );

  const nothing = composeBriefingSummary({ symbolCount: 4, includeHoldings: true, ...empty });
  cases.push(check("symbols but no data -> honest 'nothing since last briefing'", nothing.includes("No notable price moves"), nothing));
  cases.push(check("the empty summary is not silently blank", nothing.trim().length > 0, `${nothing.length} chars`));

  const withMoves = composeBriefingSummary({
    symbolCount: 3,
    includeHoldings: true,
    ...empty,
    priceMoves: [move("NVDA", 5.2), move("AMD", -3.1)],
  });
  cases.push(check("price moves are surfaced with sign and percent", withMoves.includes("NVDA +5.2%") && withMoves.includes("AMD -3.1%"), withMoves));
  cases.push(check("price moves carry an as-of date", withMoves.includes("as of 2026-08-28"), withMoves));

  const withSymbolNews = composeBriefingSummary({
    symbolCount: 2,
    includeHoldings: true,
    ...empty,
    symbolNews: [story("a"), story("b")],
  });
  cases.push(
    check(
      "holding/watchlist news is surfaced even with no category filter",
      withSymbolNews.includes("2 recent stories on your holdings and watchlist"),
      withSymbolNews,
    ),
  );

  const full = composeBriefingSummary({
    symbolCount: 5,
    includeHoldings: true,
    priceMoves: [move("NVDA", 4)],
    analyses: [analysis("NVDA")],
    events: [{ symbol: "AAPL", event_type: "earnings", event_date: "2026-09-02", title: "Q3" }],
    symbolNews: [story("a")],
    news: [{ id: "n1", title: "Sector piece", source_name: "Wire", published_at: "2026-08-30", sectors: ["tech"] }],
  });
  cases.push(check("a full briefing leads with the price move", full.startsWith("1 notable move"), full.slice(0, 40)));
  cases.push(check("a full briefing includes every section", ["notable move", "relevant analysis", "upcoming event", "holdings and watchlist", "news categories"].every((s) => full.includes(s)), full));

  // ---- quality pass (2026-09-04 walkthrough, item 6) ----
  // "analysis" pluralises irregularly - a live check found every real
  // briefing reading "3 relevant analysises: ..." instead of "analyses".
  const twoAnalyses = composeBriefingSummary({
    symbolCount: 2,
    includeHoldings: true,
    ...empty,
    analyses: [analysis("NVDA"), analysis("AMD")],
  });
  cases.push(check("plural (2 analyses) spells it correctly", twoAnalyses.includes("2 relevant analyses:"), twoAnalyses));
  cases.push(check("plural is never mis-spelled 'analysises'", !twoAnalyses.includes("analysises"), twoAnalyses));
  const oneAnalysis = composeBriefingSummary({ symbolCount: 1, includeHoldings: true, ...empty, analyses: [analysis("NVDA")] });
  cases.push(check("singular (1 analysis) reads naturally", oneAnalysis.includes("1 relevant analysis:"), oneAnalysis));

  // dedupeLatestPerSymbol: a symbol re-analyzed several times (real case -
  // MSFT has three stored runs a week apart) must surface once, not crowd
  // out every other symbol with repeats of itself.
  const reAnalyzed = [
    { scope_value: "MSFT", created_at: "2026-09-01" }, // newest
    { scope_value: "MSFT", created_at: "2026-08-24" },
    { scope_value: "MSFT", created_at: "2026-08-21" },
    { scope_value: "NVDA", created_at: "2026-08-30" },
  ];
  const deduped = dedupeLatestPerSymbol(reAnalyzed);
  cases.push(check("dedupe: MSFT's three runs collapse to one", deduped.filter((a) => a.scope_value === "MSFT").length === 1, JSON.stringify(deduped)));
  cases.push(check("dedupe: the NEWEST MSFT run is the one kept", deduped.find((a) => a.scope_value === "MSFT")?.created_at === "2026-09-01", JSON.stringify(deduped)));
  cases.push(check("dedupe: an untouched symbol (NVDA) is unaffected", deduped.some((a) => a.scope_value === "NVDA"), JSON.stringify(deduped)));
  cases.push(check("dedupe: no symbol survives duplicated", new Set(deduped.map((a) => a.scope_value)).size === deduped.length, JSON.stringify(deduped)));
  cases.push(check("dedupe: empty input, no crash", dedupeLatestPerSymbol([]).length === 0, "no crash on empty array"));

  return { suiteName: "Daily briefing summary", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("briefing-summary.ts")) {
  const suite = runBriefingSummarySuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} briefing-summary cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
