// Analysis coverage for every searchable ticker (fix/analysis-coverage).
//
// A stock with years of prices must never hit a dead end. When today's factor
// state matches fewer than MIN_FACTOR_ANALOG_SAMPLE past moments, the history
// falls back, in this order, to:
//   1. past results releases measured from the same point before (a share with
//      results due within the two-week horizon), then
//   2. the base rate over every stretch of its stored prices,
// and says which one it used. A share's results history, company figures and
// earnings-day moves are built on demand from SEC (and on schedule for every
// available share), with the same row builders the Edge Functions use.
//
// Pure: no network, no database (source checks read files).
//
// Run: npx tsx --conditions=react-server scripts/tests/analysis-coverage.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { computeFactorSet, FACTOR_FORWARD_SESSIONS, MIN_FACTOR_ANALOG_SAMPLE, type FactorBar } from "@/lib/ai/factors";
import { earningsWindows } from "@/lib/ai/similar-moments";
import { similarMoments, type ConditionData } from "@/lib/ai/similar-moments-data";
import { checkAnalysisText, generateAnalysisText, historyWords, templateAnalysisText, type TextInputs } from "@/lib/ai/analysis-text";
import { normalizeSymbol } from "@/lib/market-data/ingest";
import { directionColumns, plainName, textInputsFor } from "@/lib/ai/ticker-analysis";
import { displayHistory } from "@/lib/analysis-display";
import { findDataGaps } from "@/lib/analysis-gaps";
import { computeProbabilityBand } from "@/lib/ai/analytics";
import { earningsReactionRows, reactionWindow } from "../../supabase/functions/_shared/earnings-reactions";
import { latestSharesOutstanding, secHistoryRows, type CompanyFacts, type ParsedCompany } from "../../supabase/functions/_shared/sec-companyfacts";
import type { Scorecard } from "@/lib/scorecard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

/** Weekday bars from 2021-01-04, deterministic wobble with drift. */
function weekdayBars(n: number): FactorBar[] {
  const out: FactorBar[] = [];
  const d = new Date(Date.UTC(2021, 0, 4));
  let price = 100;
  for (let i = 0; out.length < n; i++) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      price *= 1 + Math.sin(out.length * 1.3) * 0.015 + 0.0003;
      out.push({ date: d.toISOString().slice(0, 10), close: Number(price.toFixed(4)), volume: 1000 });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const card = { symbol: "AMD", asOf: "2026-09-25", dimensions: [] } as unknown as Scorecard;

export async function runAnalysisCoverageSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];

  // --- 1. earningsWindows: the same point before each past release.
  const bars = weekdayBars(1300);
  const releases = ["2022-02-01", "2022-05-03", "2022-08-02", "2022-11-01", "2023-01-31", "2023-05-02", "2023-08-01", "2023-10-31"];
  const w = earningsWindows(bars, releases, 4, FACTOR_FORWARD_SESSIONS);
  const first = w[0];
  const releaseIdx = bars.findIndex((b) => b.date >= releases[0]);
  cases.push(check("one window per release inside stored prices", w.length === releases.length, `${w.length}`));
  cases.push(check("window starts k sessions before the release session", first.index === releaseIdx - 4 && first.date === bars[releaseIdx - 4].date, `${first.date} vs release ${releases[0]}`));
  cases.push(check(`window runs ${FACTOR_FORWARD_SESSIONS} sessions`, first.dateAfter === bars[releaseIdx - 4 + FACTOR_FORWARD_SESSIONS].date, first.dateAfter));
  const outside = earningsWindows(bars, ["2020-06-01", "2030-01-01", ...releases], 4, FACTOR_FORWARD_SESSIONS);
  cases.push(check("releases outside stored prices are skipped, never shortened", outside.length === releases.length, `${outside.length}`));
  const crowded = earningsWindows(bars, ["2022-02-01", "2022-02-03"], 4, FACTOR_FORWARD_SESSIONS);
  cases.push(check("overlapping windows keep only the first", crowded.length === 1, `${crowded.length}`));

  // --- 2. similarMoments: the fallback order.
  const set = computeFactorSet({ symbol: "AMD", assetType: "equity", bars, benchmark: null })!;
  const today = bars[bars.length - 1].date; // a weekday
  const d = new Date(`${today}T00:00:00Z`);
  const plusWeekdays = (n: number) => {
    const x = new Date(d);
    let k = 0;
    while (k < n) {
      x.setUTCDate(x.getUTCDate() + 1);
      if (x.getUTCDay() !== 0 && x.getUTCDay() !== 6) k++;
    }
    return x.toISOString().slice(0, 10);
  };
  const pastReleases = bars.filter((_, i) => i % 63 === 30 && i < bars.length - 20).map((b) => b.date);
  const data = (upcoming: string[]): ConditionData => ({ releaseDates: pastReleases, quarters: [], annualEps: new Map(), pricesAsc: [], upcomingEarnings: upcoming });
  const unusual = { ok: false as const, reason: "insufficient_instances" as const, bestSampleSize: 3, conditions: [] };

  const e = similarMoments({ set, result: unusual, assetType: "equity", scorecard: card, data: data([plusWeekdays(4)]), today })!;
  cases.push(check("too few matches + results due in 4 sessions -> earnings windows", e.kind === "earnings" && e.earnings?.sessionsToRelease === 4 && e.history.n >= MIN_FACTOR_ANALOG_SAMPLE, `${e.kind} n=${e.history.n}`));
  cases.push(check("earnings fallback records why (unusual_setup, 3 matches)", e.fallback?.reason === "unusual_setup" && e.fallback.matches === 3, JSON.stringify(e.fallback)));

  const far = similarMoments({ set, result: unusual, assetType: "equity", scorecard: card, data: data([plusWeekdays(30)]), today })!;
  cases.push(check("results not within the horizon -> base rate, labelled as a fallback", far.kind === "baseline" && far.fallback?.matches === 3 && far.history.n > 50, `${far.kind} n=${far.history.n}`));

  const coin = similarMoments({ set, result: unusual, assetType: "crypto", scorecard: card, data: data([plusWeekdays(4)]), today })!;
  cases.push(check("a coin never gets the earnings fallback", coin.kind === "baseline" && !!coin.fallback, coin.kind));
  const fund = similarMoments({ set, result: unusual, assetType: "etf", scorecard: card, data: data([plusWeekdays(4)]), today })!;
  cases.push(check("a fund never gets the earnings fallback", fund.kind === "baseline" && !!fund.fallback, fund.kind));

  const ordinary = similarMoments({ set, result: { ok: false, reason: "no_active_conditions", bestSampleSize: 0, conditions: [] }, assetType: "equity", scorecard: card, data: data([plusWeekdays(4)]), today })!;
  cases.push(check("an ordinary day stays the plain base rate (no fallback label)", ordinary.kind === "baseline" && !ordinary.fallback, `${ordinary.kind} ${JSON.stringify(ordinary.fallback)}`));

  const noReleases = similarMoments({ set, result: unusual, assetType: "equity", scorecard: card, data: { ...data([plusWeekdays(4)]), releaseDates: [] }, today })!;
  cases.push(check("no stored results history -> base rate", noReleases.kind === "baseline", noReleases.kind));

  // --- 3. The words: which fallback, never "similar moments", never a dead end.
  const baseW = historyWords(far.history, "AMD", "equity", null, "baseline", { fallback: { matches: 3 } })!;
  cases.push(
    check(
      "base-rate fallback says the setup is unusual, then the base rate",
      baseW.line.startsWith("Today's setup for AMD is unusual: it matched only 3 past moments, too few to measure. Its base rate instead: over any 2 weeks in its stored prices, it ended higher in ") &&
        baseW.line.endsWith(` of ${far.history.n}.`),
      baseW.line,
    ),
  );
  const earnW = historyWords(e.history, "AMD", "equity", null, "earnings", { fallback: { matches: 3 }, sessionsToRelease: 4 })!;
  cases.push(check("earnings fallback names the results and the same point before", /Results are due in 4 trading days\. From the same point before past results, AMD ended higher 2 weeks later in \d+ of \d+\./.test(earnW.line), earnW.line));
  for (const [label, line] of [["base-rate", baseW.line], ["earnings", earnW.line]] as const) {
    cases.push(check(`${label} fallback never says "similar moments"`, !/similar\s+moments?/i.test(line), line));
  }

  for (const [label, sm] of [["earnings", e], ["base-rate", far]] as const) {
    const band = computeProbabilityBand(sm.cases.map((c, i) => ({ id: String(i), event_type: "price_window", event_date: c.date, price_before: c.priceBefore, price_after: c.priceAfter })));
    const inputs: TextInputs = textInputsFor({ name: "Advanced Micro Devices", symbol: "AMD", assetType: "equity", factorAnalysis: null, sm, scorecard: card, calendar: [], news: [], band });
    const t = templateAnalysisText(inputs);
    const r = checkAnalysisText(t, inputs, { minWatch: 0 });
    cases.push(check(`${label} fallback: Cairn's template passes every guard (numbers from inputs, no "similar moments")`, r.passed, `${r.reason ?? "passed"} ${r.evidence ?? ""}`));
    const cols = directionColumns(sm, { text: { ...t, watch: [], sources_used: [] }, source: "template", attempts: [] });
    const cond = cols.direction_conditions as Record<string, unknown>;
    cases.push(check(`${label} fallback is stored with its basis and reason`, cond.basis === sm.kind && (cond.fallback as { matches?: number })?.matches === 3, JSON.stringify({ basis: cond.basis, fallback: cond.fallback, earnings: cond.earnings })));
    const shown = displayHistory(
      { ...cols, id: "x", scope_type: "ticker", scope_value: "AMD", analysis_type: "directional_history", probability_low: 1, probability_high: 2, confidence_level: "low", sample_size: 1, reasoning_text: "", created_at: "2026-09-27" } as never,
      "AMD",
      "equity",
      [],
    );
    cases.push(
      check(
        `${label} fallback is labelled on the page`,
        (label === "earnings" ? shown.kind === "earnings" && /Around past results/.test(shown.basisLabel ?? "") : shown.kind === "baseline" && /Base rate: today's setup matched too few/.test(shown.basisLabel ?? "")) && shown.line === historyWords(sm.history, "AMD", "equity", null, sm.kind, { fallback: { matches: 3 }, ...(sm.earnings ? { sessionsToRelease: 4 } : {}) })!.line,
        `${shown.kind} | ${shown.basisLabel} | ${shown.line}`,
      ),
    );
  }

  // --- 4. No dead end for a ticker with a base rate on file.
  const g = findDataGaps({ scopeType: "ticker", analogCount: 0, fallbackCount: 125, sourceCount: 3, factor: { ok: false, reason: "insufficient_instances", bestSampleSize: 2 }, minSample: MIN_FACTOR_ANALOG_SAMPLE });
  cases.push(check("unusual setup with a stored base rate -> no gap", g.length === 0, JSON.stringify(g)));
  const g2 = findDataGaps({ scopeType: "ticker", analogCount: 0, fallbackCount: 125, sourceCount: 3, factor: { ok: false, reason: "no_active_conditions", bestSampleSize: 0 }, minSample: MIN_FACTOR_ANALOG_SAMPLE });
  cases.push(check("ordinary day with no curated cases but a base rate -> no gap", g2.length === 0, JSON.stringify(g2)));

  // --- 5. Earnings-day moves from SEC releases: NVDA's curated shape, with provenance.
  const rb = [
    { date: "2024-01-30", close: 100, volume: 1 },
    { date: "2024-01-31", close: 101, volume: 9 },
    { date: "2024-02-01", close: 110, volume: 2 },
  ];
  const win = reactionWindow(rb, "2024-01-31");
  cases.push(check("reaction window: close strictly before -> strictly after", win?.before === 100 && win?.after === 110 && win?.volume === 9, JSON.stringify(win)));
  const rows = earningsReactionRows("AMD", [{ release_date: "2024-01-31", accn: "0000002488-24-000010", timing: "after_close" }, { release_date: "2019-01-01", accn: "x" }], rb);
  cases.push(
    check(
      "earnings rows: event_type earnings, before/after prices, SEC accession as provenance; unmeasurable releases skipped",
      rows.length === 1 && rows[0].event_type === "earnings" && rows[0].price_before === 100 && rows[0].price_after === 110 && rows[0].metadata.accn === "0000002488-24-000010" && /8-K item 2\.02/.test(rows[0].description),
      JSON.stringify(rows),
    ),
  );

  // --- 6. One SEC row builder for both paths.
  const parsed = {
    cik: "0000002488",
    entityName: "AMD",
    quarters: [{ fiscal_year: 2024, fiscal_quarter: 1, period_start: "2024-01-01", period_end: "2024-03-30", values: { revenue: 5 }, provenance: {} }],
    annual: [{ fiscal_year: 2023, period_start: "2023-01-01", period_end: "2023-12-30", values: { revenue: 20 } }],
    splits: [],
  } as unknown as ParsedCompany;
  const built = secHistoryRows("AMD", "0000002488", parsed, [{ accn: "a", release_date: "2024-01-30", accepted_at: null, timing: "unknown" }], "2026-09-27T00:00:00Z");
  cases.push(check("secHistoryRows: quarters, years and releases keyed for their upserts", built.quarters[0].fiscal_quarter === 1 && built.annual[0].fiscal_year === 2023 && built.releases[0].release_date === "2024-01-30" && built.releases[0].symbol === "AMD", JSON.stringify(built).slice(0, 200)));
  const shares = latestSharesOutstanding({ cik: 1, facts: { "us-gaap": { CommonStockSharesOutstanding: { units: { shares: [{ end: "2023-12-30", val: 1, accn: "a", form: "10-K", filed: "x" }, { end: "2024-06-29", val: 2, accn: "b", form: "10-Q", filed: "y" }] } } } } } as CompanyFacts);
  cases.push(check("shares outstanding: the newest reported figure", shares?.val === 2 && shares.end === "2024-06-29", JSON.stringify(shares)));

  // --- 6b. Names and symbols the sweep tripped on (2026-09-27).
  cases.push(check('SEC state suffix dropped: "Lifecore Biomedical, INC. DE" -> "Lifecore Biomedical"', plainName("Lifecore Biomedical, INC. DE", "LFCR", "equity") === "Lifecore Biomedical", plainName("Lifecore Biomedical, INC. DE", "LFCR", "equity")));
  cases.push(check('SEC country suffix dropped: "Bank OF Montreal /CAN/" -> "Bank OF Montreal"', plainName("Bank OF Montreal /CAN/", "TAWN", "equity") === "Bank OF Montreal", plainName("Bank OF Montreal /CAN/", "TAWN", "equity")));
  cases.push(check("a name with a real two-letter word is untouched", plainName("Bank of America Corp", "BAC", "equity") === "Bank of America", plainName("Bank of America Corp", "BAC", "equity")));
  cases.push(check("an underscore symbol from the coin directory is valid (FIGR_HELOC)", normalizeSymbol("figr_heloc") === "FIGR_HELOC", String(normalizeSymbol("figr_heloc"))));
  {
    const band0 = computeProbabilityBand(far.cases.map((c, i) => ({ id: String(i), event_type: "price_window", event_date: c.date, price_before: c.priceBefore, price_after: c.priceAfter })));
    const bad = textInputsFor({ name: "Odd Name, INC. X.Y. Z", symbol: "ODD", assetType: "equity", factorAnalysis: null, sm: far, scorecard: card, calendar: [], news: [], band: band0 });
    const g = await generateAnalysisText(bad, { complete: async () => null, classify: async () => ({ status: "ok" }) as never });
    cases.push(check("a name the checks cannot read: the template retries under the ticker instead of failing the analysis", g.source === "template" && g.text.headline.startsWith("ODD"), g.text.headline));
  }

  // --- 7. Wiring (source).
  const read = (p: string) => fs.readFileSync(path.resolve(p), "utf8");
  const generate = read("src/lib/ai/generate.ts");
  cases.push(check("generate.ts flags direction rows by id, not by date or type", /in_direction_set: directionIds\.has\(e\.id\)/.test(generate), "in_direction_set"));
  cases.push(check("generate.ts stores the band's basis (analogs or base rate)", /band_basis: bandBasis/.test(generate), "band_basis"));
  cases.push(check("earnings windows never enter the curated band read", /EARNINGS_WINDOW_EVENT_TYPE\}\)`/.test(generate), "curated read excludes earnings_window"));
  const pipe = read("src/lib/ai/analysis-pipeline.ts");
  cases.push(check("the pipeline builds company data on demand for shares", /if \(assetType === "equity"\) \{\s*const company = await ensureCompanyData\(scopeValue\)/.test(pipe), "ensureCompanyData"));
  const company = read("src/lib/market-data/company-data.ts");
  cases.push(check("on-demand SEC fetches are throttled, identified and cached", /SEC_MIN_INTERVAL_MS/.test(company) && /SEC_USER_AGENT/.test(company) && /FRESH_DAYS/.test(company) && /secHistoryRows\(/.test(company), "throttle + UA + freshness + shared rows"));
  for (const fn of ["ingest-fundamentals", "ingest-historical-events"]) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    cases.push(check(`${fn} covers every available share in symbol_directory`, /from\("symbol_directory"\)\s*\.select\("symbol"\)\s*\.eq\("status", "available"\)\s*\.eq\("asset_type", "equity"\)/.test(src), fn));
  }
  cases.push(check("ingest-historical-events adds SEC earnings reactions and pages its price read", /earningsReactionRows\(/.test(read("supabase/functions/ingest-historical-events/index.ts")) && /readNewestFirstPaged/.test(read("supabase/functions/ingest-historical-events/index.ts")), "sec earnings + paged"));

  return { suiteName: "Analysis coverage (fallbacks, on-demand company data)", gating: true, cases };
}

async function main() {
  const suite = await runAnalysisCoverageSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name}${c.status === "pass" ? "" : `\n      ${c.detail}`}`);
  console.log(`Report written to ${writeReport([suite])}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
