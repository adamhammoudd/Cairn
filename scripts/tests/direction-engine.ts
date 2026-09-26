// Section 1 (feat/analysis-engine-v2): what the engine computes.
//
// Direction, not magnitude. From the same factor-derived cases the engine has
// always used (10 sessions ahead), it now reports how many ended higher, a
// Wilson interval on that up-rate, the typical signed move (25th / 50th / 75th
// percentile) and the worst and best case. The >=5% move band is still
// computed, as a trader figure. Extra "similar moment" conditions (earnings
// within 7 sessions, scorecard trend level, valuation vs its own history) are
// each tested on their own, including the coin and fund paths.
//
// Run: npx tsx --conditions=react-server scripts/tests/direction-engine.ts

import { pathToFileURL } from "node:url";
import { wilsonInterval, computeProbabilityBand, gradeConfidence } from "@/lib/ai/analytics";
import { directionalHistory, signedPercentile } from "@/lib/ai/direction";
import {
  applyConditions,
  earningsWithinSessions,
  sessionsUntil,
  trendLevelSeries,
  valuationLevelAt,
  FILING_LAG_DAYS,
  EARNINGS_WINDOW_SESSIONS,
  todayConditionStates,
} from "@/lib/ai/similar-moments";
import { computeFactorSet, scanWindows } from "@/lib/ai/factors";
import { conditionSpecs, ENGINE_CONDITIONS, similarMoments } from "@/lib/ai/similar-moments-data";
import type { Scorecard } from "@/lib/scorecard";
import { trendDimension, trendInputsFromFactorSet, THRESHOLDS } from "@/lib/scorecard";
import type { Quarter } from "@/lib/fundamentals";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function cases(moves: number[]) {
  return moves.map((m, i) => ({
    date: new Date(Date.UTC(2023, 0, 2) + i * 14 * 86_400_000).toISOString().slice(0, 10),
    priceBefore: 100,
    priceAfter: 100 + m,
  }));
}

/** Weekday dates from `start`, one per bar. */
function weekdays(start: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < count) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function quarter(fy: number, fq: 1 | 2 | 3 | 4, periodEnd: string, eps: number): Quarter {
  return {
    fiscal_year: fy,
    fiscal_quarter: fq,
    period_end: periodEnd,
    revenue: 100,
    net_income: 10,
    operating_income: 12,
    depreciation_amortization: 2,
    operating_cash_flow: 11,
    capex: 3,
    dividends_paid: null,
    eps_diluted: eps,
    dividends_per_share: null,
    cash: 50,
    long_term_debt: 20,
    long_term_debt_noncurrent: null,
    long_term_debt_current: null,
    debt_current: null,
    short_term_borrowings: null,
  };
}

export function runDirectionEngineSuite(): SuiteResult {
  const out: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, status: ok ? "pass" : "fail", detail });

  // ------------------------------------------------------------ direction
  // The brief's example: 14 similar moments, 9 higher.
  const moves = [3, -2, 5, 1, -4, 2, 6, -1, 2, 3, -3, 4, 1, -2];
  const h = directionalHistory(cases(moves), 10);
  check("counts higher vs lower-or-unchanged", h.status === "ok" && h.n === 14 && h.higher === 9 && h.lower === 5, `${h.higher} of ${h.n}`);

  const w = wilsonInterval(9, 14);
  check(
    "Wilson interval on the UP-rate (not on the >=5% rate)",
    h.upRate.point === 64 && h.upRate.low === Math.round(w.low * 100) && h.upRate.high === Math.round(w.high * 100),
    `${h.upRate.point}% (${h.upRate.low}-${h.upRate.high}), Wilson ${w.low.toFixed(3)}-${w.high.toFixed(3)}`,
  );
  check("confidence: 14 cases -> medium (existing rule)", h.confidence === "medium", h.confidence);

  // Sorted: -4,-3,-2,-2,-1,1,1,2,2,3,3,4,5,6. Linear interpolation:
  // p25 at 3.25 -> -1.75, median at 6.5 -> 1.5, p75 at 9.75 -> 3.
  check(
    "typical outcome: 25th/50th/75th percentile of SIGNED moves",
    h.typical !== null && h.typical.p25 === -1.8 && h.typical.median === 1.5 && h.typical.p75 === 3,
    JSON.stringify(h.typical),
  );
  check("worst and best case seen", h.worst === -4 && h.best === 6, `${h.worst} / ${h.best}`);
  check("percentile rounding is symmetric about zero (-1.75 -> -1.8, 1.75 -> 1.8)", signedPercentile([-1.75], 0.5) === -1.8 && signedPercentile([1.75], 0.5) === 1.8, `${signedPercentile([-1.75], 0.5)} / ${signedPercentile([1.75], 0.5)}`);
  check(
    "cases carry their signed move, oldest first",
    h.cases.length === 14 && h.cases[0].movePct === 3 && h.cases[1].movePct === -2 && h.cases[0].date < h.cases[13].date,
    JSON.stringify(h.cases.slice(0, 2)),
  );

  const flat = directionalHistory(cases([0, 1, 1, 1, 1]), 10);
  check("a flat case counts as lower-or-unchanged, never higher", flat.higher === 4 && flat.lower === 1, `${flat.higher}/${flat.lower}`);

  const few = directionalHistory(cases([2, -1, 3]), 10);
  check(
    "under 5 cases: status too_few, confidence low, no typical range stated",
    few.status === "too_few" && few.confidence === "low" && few.typical === null && few.worst === null && few.best === null,
    JSON.stringify({ s: few.status, c: few.confidence, t: few.typical }),
  );
  const none = directionalHistory([], 10);
  check("no cases: n=0, too_few, no invented zeros for the range", none.n === 0 && none.typical === null && none.upRate.point === null, JSON.stringify(none.upRate));

  // Wide interval is never high, even with many cases.
  const wide = directionalHistory(cases(Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? 1 : -1))), 10);
  check("16 cases split 8/8: interval ~47 wide -> medium, not high", wide.confidence === "medium", `${wide.upRate.low}-${wide.upRate.high} ${wide.confidence}`);
  const tight = directionalHistory(cases(Array.from({ length: 60 }, (_, i) => (i % 10 < 8 ? 1 : -1))), 10);
  check("60 cases, 48 higher: narrow interval -> high", tight.confidence === "high", `${tight.upRate.low}-${tight.upRate.high} ${tight.confidence}`);

  check(
    "gradeConfidence is the one rule shared with the >=5% band",
    gradeConfidence(4, 0.4, 0.5) === "low" && gradeConfidence(20, 0.2, 0.75) === "low" && gradeConfidence(14, 0.4, 0.6) === "medium" && gradeConfidence(20, 0.4, 0.6) === "high",
    "n<5 low; width>50 low; n<15 medium; else high",
  );

  // The >=5% band is still computed from the same cases, unchanged.
  const band = computeProbabilityBand(cases(moves).map((c, i) => ({ id: String(i), event_type: "factor_signal", event_date: c.date, price_before: c.priceBefore, price_after: c.priceAfter })));
  check(
    "the >=5% move band is still computed and exposed as a trader figure",
    h.trader.moveBand.sampleCount === 14 && h.trader.moveBand.hitCount === band.hitCount && h.trader.moveBand.low === band.low && h.trader.moveBand.high === band.high && h.trader.thresholdPct === 5,
    `${h.trader.moveBand.hitCount} of 14 moved >=5% (${h.trader.moveBand.low}-${h.trader.moveBand.high}%)`,
  );

  // ---------------------------------------------------- earnings condition
  const dates = weekdays("2024-01-01", 40); // Mon 1 Jan 2024 onward
  const bars = dates.map((d) => ({ date: d }));
  // Entry at index 5 (Mon 8 Jan). Window is (8 Jan, bar 12 = Wed 17 Jan].
  check("earnings on the entry day itself is not 'upcoming'", !earningsWithinSessions(bars, 5, [dates[5]], EARNINGS_WINDOW_SESSIONS), dates[5]);
  check("earnings 7 sessions after entry is inside the window", earningsWithinSessions(bars, 5, [dates[12]], EARNINGS_WINDOW_SESSIONS), dates[12]);
  check("earnings 8 sessions after entry is outside", !earningsWithinSessions(bars, 5, [dates[13]], EARNINGS_WINDOW_SESSIONS), dates[13]);
  check("earnings the session after entry is inside", earningsWithinSessions(bars, 5, [dates[6]], EARNINGS_WINDOW_SESSIONS), dates[6]);
  check("sessionsUntil counts weekdays after today: Fri -> Mon = 1", sessionsUntil("2024-01-05", "2024-01-08") === 1, String(sessionsUntil("2024-01-05", "2024-01-08")));
  check("sessionsUntil: Mon -> next Tue = 6", sessionsUntil("2024-01-01", "2024-01-09") === 6, String(sessionsUntil("2024-01-01", "2024-01-09")));
  check("sessionsUntil: a past date is negative, never 'upcoming'", sessionsUntil("2024-01-09", "2024-01-01") < 0, String(sessionsUntil("2024-01-09", "2024-01-01")));

  // --------------------------------------------------- trend level condition
  // 300 bars rising 0.2% a day, then 150 falling 0.3% a day.
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < 300; i++) closes.push((p *= 1.002));
  for (let i = 0; i < 150; i++) closes.push((p *= 0.997));
  const levels = trendLevelSeries(closes, 252);
  check("trend level: Rising after a long climb", levels[299] === "Rising", String(levels[299]));
  check("trend level: Falling after a long drop", levels[449] === "Falling", String(levels[449]));
  check("trend level: null before 200 bars (no invented state)", levels[150] === null, String(levels[150]));
  const set = computeFactorSet({ symbol: "X", assetType: "equity", bars: closes.map((c, i) => ({ date: weekdays("2022-01-03", 450)[i], close: c, volume: 1000 })) });
  const scoreVerdict = trendDimension(trendInputsFromFactorSet(set)).verdict;
  check("trend level today == the scorecard's own trend verdict (same rule, same bars)", levels[449] === scoreVerdict, `${levels[449]} vs scorecard ${scoreVerdict}`);
  check("trend thresholds are the scorecard's, not new ones", THRESHOLDS.trend.sixMonthMove === 0.05, String(THRESHOLDS.trend.sixMonthMove));

  // ----------------------------------------------- valuation level condition
  // 12 quarters of EPS 1 each (TTM 4). Prices at 80 -> P/E 20 at every quarter end.
  const qEnds = ["2021-03-31", "2021-06-30", "2021-09-30", "2021-12-31", "2022-03-31", "2022-06-30", "2022-09-30", "2022-12-31", "2023-03-31", "2023-06-30", "2023-09-30", "2023-12-31"];
  const quarters = qEnds.map((d, i) => quarter(2021 + Math.floor(i / 4), ((i % 4) + 1) as 1 | 2 | 3 | 4, d, 1));
  const priceDays = weekdays("2021-01-04", 900);
  const prices = priceDays.map((d) => ({ date: d, close: d < "2024-04-01" ? 80 : 120 }));
  check("valuation: P/E at its own average -> usual", valuationLevelAt("2024-03-15", quarters, prices, undefined) === "usual", String(valuationLevelAt("2024-03-15", quarters, prices, undefined)));
  check("valuation: price up 50% on the same profit -> pricier", valuationLevelAt("2024-06-03", quarters, prices, undefined) === "pricier", String(valuationLevelAt("2024-06-03", quarters, prices, undefined)));
  check(
    `valuation: no look-ahead - a quarter counts only ${FILING_LAG_DAYS} days after it ends`,
    valuationLevelAt("2022-10-15", quarters, prices, undefined) === null,
    "2022-10-15: only quarters ending on/before 2022-08-16 are known -> 3 P/E points, under the 8 needed",
  );
  check("valuation: no quarters -> null, never a zero", valuationLevelAt("2024-03-15", [], prices, undefined) === null, "no filings");

  // --------------------------------------------------------- applyConditions
  const base = cases([1, 2, 3, -1, -2, 4, 5, -3, 1, 2]).map((c, i) => ({ ...c, tag: i < 6 ? "A" : "B", other: i < 3 ? "X" : "Y" }));
  const applied = applyConditions(
    base,
    [
      { key: "trend_level", label: "Same price trend", today: "A", stateOf: (c) => c.tag },
      { key: "earnings_window", label: "Results due within 7 sessions", today: "X", stateOf: (c) => c.other },
    ],
    5,
  );
  check("a condition that leaves >=5 cases is applied", applied.report[0].kept && applied.report[0].nBefore === 10 && applied.report[0].nAfter === 6, JSON.stringify(applied.report[0]));
  check(
    "a condition that would leave <5 is dropped and reported, not applied",
    !applied.report[1].kept && applied.report[1].reason === "too_few" && applied.report[1].nAfter === 3 && applied.cases.length === 6,
    JSON.stringify(applied.report[1]),
  );
  const noState = applyConditions(base, [{ key: "valuation_level", label: "Price vs profit", today: null, stateOf: () => "usual" }], 5);
  check("no state today (e.g. no filings) -> not applied, reason stated", !noState.report[0].kept && noState.report[0].reason === "no_state_today" && noState.cases.length === 10, JSON.stringify(noState.report[0]));

  // --------------------------------------------------------- coin / fund paths
  const coin = todayConditionStates({ assetType: "crypto", today: "2026-09-26", upcomingEarnings: [], trendLevel: "Rising", valuationVerdict: null });
  check(
    "coin: earnings and valuation are not applicable (no company), trend still applies",
    coin.earnings_window.applies === false && coin.valuation_level.applies === false && coin.trend_level.applies === true && coin.trend_level.today === "Rising",
    JSON.stringify(coin),
  );
  const fund = todayConditionStates({ assetType: "etf", today: "2026-09-26", upcomingEarnings: [], trendLevel: "Sideways", valuationVerdict: null });
  check("fund: no company conditions either", fund.earnings_window.applies === false && fund.valuation_level.applies === false, JSON.stringify(fund));
  const stock = todayConditionStates({ assetType: "equity", today: "2026-09-25", upcomingEarnings: ["2026-10-02"], trendLevel: "Rising", valuationVerdict: "Pricier than usual" });
  check(
    "stock: results 5 sessions away -> earnings state 'within'; valuation verdict mapped to its level",
    stock.earnings_window.today === "within" && stock.valuation_level.today === "pricier",
    JSON.stringify(stock),
  );
  const stockFar = todayConditionStates({ assetType: "equity", today: "2026-09-25", upcomingEarnings: ["2026-11-18"], trendLevel: "Rising", valuationVerdict: "Cash yield high" });
  check(
    "stock: results far off -> 'not_within'; a non-P/E valuation verdict gives no valuation state",
    stockFar.earnings_window.today === "not_within" && stockFar.valuation_level.today === null,
    JSON.stringify(stockFar),
  );

  // ------------------------------------------------ the engine, end to end
  check(
    "the engine applies earnings and trend, in that order; valuation was dropped by measurement",
    ENGINE_CONDITIONS.join(",") === "earnings_window,trend_level",
    ENGINE_CONDITIONS.join(","),
  );
  // A coin: 450 daily bars, factor analogs found, no company.
  const coinDates = Array.from({ length: 450 }, (_, i) => new Date(Date.UTC(2023, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
  const coinSet = computeFactorSet({ symbol: "COIN", assetType: "crypto", bars: closes.map((c, i) => ({ date: coinDates[i], close: c, volume: null })) })!;
  const coinCases = [200, 212, 224, 236, 248, 260, 272].map((idx) => ({ index: idx, date: coinDates[idx], dateAfter: coinDates[idx + 10], priceBefore: closes[idx], priceAfter: closes[idx + 10], movePct: 0 }));
  const naDim = (key: string) => ({ key, label: key, level: "not_applicable", rated: true, verdict: "Not applicable", sentence: "", inputs: [], sources: [] });
  const coinCard = {
    symbol: "COIN",
    asOf: "2024-03-25",
    dimensions: [naDim("valuation"), naDim("growth"), naDim("health"), naDim("dividend"), { ...naDim("trend"), level: "strong", verdict: "Rising" }, { ...naDim("next_event"), rated: false }],
  } as unknown as Scorecard;
  const sm = similarMoments({
    set: coinSet,
    result: { ok: true, analogs: { conditions: [{ key: "trend", state: "uptrend", label: "uptrend", frequency: 0.3 }], droppedConditions: [], instances: coinCases, horizonSessions: 10 } },
    assetType: "crypto",
    scorecard: coinCard,
    data: { releaseDates: [], quarters: [], annualEps: new Map(), pricesAsc: [], upcomingEarnings: [] },
    today: "2024-03-25",
  })!;
  check(
    "coin end to end: earnings reported not applicable, trend applied, history counted from what is left",
    sm.conditions[0].reason === "not_applicable" && sm.conditions[1].reason === "applied" && sm.history.n === 7 && sm.history.status === "ok" && sm.baseCount === 7,
    JSON.stringify(sm.conditions),
  );
  check("coin end to end: no company figure anywhere in the result (no zeros)", !JSON.stringify(sm).match(/valuation|eps|pe"/i), "only price-based conditions");
  const stockNoReleases = conditionSpecs({
    set: coinSet,
    assetType: "equity",
    scorecard: coinCard,
    data: { releaseDates: [], quarters: [], annualEps: new Map(), pricesAsc: [], upcomingEarnings: [] },
    today: "2024-03-25",
    keys: ["earnings_window"],
  })[0];
  check(
    "a share with no results history stored: earnings has no state today (not 'never had results')",
    stockNoReleases.applies === true && stockNoReleases.today === null,
    JSON.stringify({ applies: stockNoReleases.applies, today: stockNoReleases.today }),
  );
  check("too_few is returned as null by the glue when the factor scan failed", similarMoments({ set: coinSet, result: { ok: false, reason: "insufficient_instances", bestSampleSize: 2, conditions: [] }, assetType: "crypto", scorecard: coinCard, data: { releaseDates: [], quarters: [], annualEps: new Map(), pricesAsc: [], upcomingEarnings: [] }, today: "2024-03-25" }) === null, "null");

  // ------------------------------------ nothing unusual today: the base rate
  const windows = scanWindows(coinSet, 10);
  check(
    "base-rate windows: every non-overlapping 10-session stretch, forward window complete",
    windows.length === Math.floor((coinSet.bars.length - 1 - 10) / 10) + 1 && windows.every((w, i) => i === 0 || w.index - windows[i - 1].index === 10),
    `${windows.length} windows over ${coinSet.bars.length} bars`,
  );
  const baseline = similarMoments({
    set: coinSet,
    result: { ok: false, reason: "no_active_conditions", bestSampleSize: 0, conditions: [] },
    assetType: "crypto",
    scorecard: coinCard,
    data: { releaseDates: [], quarters: [], annualEps: new Map(), pricesAsc: [], upcomingEarnings: [] },
    today: "2024-03-25",
  });
  check(
    "no unusual state today: the base rate over every window, labelled 'baseline', no extra conditions applied",
    baseline !== null && baseline.kind === "baseline" && baseline.history.n === windows.length && baseline.conditions.length === 0 && baseline.factorConditions.length === 0,
    JSON.stringify({ kind: baseline?.kind, n: baseline?.history.n, conditions: baseline?.conditions.length }),
  );
  check(
    "a rare state (too few cases) is NOT swapped for the base rate",
    similarMoments({ set: coinSet, result: { ok: false, reason: "insufficient_instances", bestSampleSize: 3, conditions: [] }, assetType: "crypto", scorecard: coinCard, data: { releaseDates: [], quarters: [], annualEps: new Map(), pricesAsc: [], upcomingEarnings: [] }, today: "2024-03-25" }) === null,
    "null",
  );
  check("a normal result is labelled 'similar'", sm.kind === "similar", String(sm.kind));

  return { suiteName: "Direction engine (up-rate, typical range, similar-moment conditions)", gating: true, cases: out };
}

async function main() {
  const suite = runDirectionEngineSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
