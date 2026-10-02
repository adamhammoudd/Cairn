// Section 2 (feat/scorecard): the six-dimension scorecard.
//
// Table-driven cases per dimension, including every threshold boundary,
// missing data, crypto and ETFs, and a snapshot of the full card for three
// synthetic companies (a fast grower, a dividend payer with debt, a coin).
//
// The brief asks for snapshots of NVDA, MSFT and KO built from real SEC
// fixtures. Those fixtures are blocked on data.sec.gov access (see PR #137),
// so the snapshots here use synthetic companies; the real ones are added with
// the fixtures.
//
// Run: npx tsx --conditions=react-server scripts/tests/scorecard.ts
//      (add --update to rewrite the snapshot after a deliberate change)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  NO_EVENT_VERDICT,
  THRESHOLDS,
  VALUATION_VERDICTS,
  hasUpcomingEvent,
  barSegments,
  buildScorecard,
  dividendDimension,
  growthDimension,
  healthDimension,
  marketMedianPe,
  nextEventDimension,
  sectorMedianPe,
  trendDimension,
  trendInputsFromFactorSet,
  valuationDimension,
  type Dimension,
  type ScorecardInput,
  type ValuationInput,
} from "@/lib/scorecard";
import type { CompanyMetrics, PeHistory } from "@/lib/fundamentals";
import type { FactorSet } from "@/lib/ai/factors";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const FILING = { accn: "0001045810-25-000230", form: "10-Q", filed: "2025-11-19", cik: "0001045810" };

function metrics(over: Partial<Omit<CompanyMetrics, "ttm">> & { ttm?: Partial<CompanyMetrics["ttm"]> } = {}): CompanyMetrics {
  const { ttm, ...rest } = over;
  return {
    asOf: "2025-10-26",
    ttm: {
      period_end: "2025-10-26",
      revenue: 1000,
      net_income: 300,
      operating_income: 400,
      ebitda: 450,
      operating_cash_flow: 420,
      capex: 60,
      free_cash_flow: 360,
      dividends_paid: 0,
      eps: 3,
      dividends_per_share: null,
      ...ttm,
    },
    revenueGrowth: 0.25,
    netIncomeGrowth: 0.3,
    revenueGrowthLatestQuarter: 0.2,
    revenueGrowthPriorQuarter: 0.3,
    ebitdaMargin: 0.45,
    operatingMargin: 0.4,
    netMargin: 0.3,
    cash: 500,
    totalDebt: 200,
    netDebt: -300,
    netDebtToEbitda: -300 / 450,
    payoutOfFcf: 0,
    payoutOfNetIncome: 0,
    ...rest,
  };
}

function pe(current: number, avg: number | null): PeHistory {
  return {
    points: [],
    fiveYearAverage: avg,
    count: avg === null ? 3 : 20,
    current: { period_end: "2025-10-26", price: current * 3, eps: 3, pe: current },
  };
}

const val = (over: Partial<ValuationInput>): ValuationInput => ({ pe: null, sector: null, fcfYield: null, priceDate: "2025-09-25", filing: FILING, ...over });
const sector = (median: number, peers = 8) => ({ median, peers, name: "Semiconductors" });
const market = (median: number, companies: number) => ({ median, companies });

export function runScorecardSuite(opts: { update?: boolean } = {}): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });
  const is = (d: Dimension, level: string, verdict: string) => d.level === level && d.verdict === verdict;
  const show = (d: Dimension) => `${d.level}/${d.verdict}: ${d.sentence}`;

  // ---- price vs profit ------------------------------------------------------
  const V = THRESHOLDS.valuation;
  const VV = VALUATION_VERDICTS;
  const valuationTable: [string, ValuationInput, string, string][] = [
    ["P/E 45 vs own 38 -> Pricier than usual (sector 24 is context only)", val({ pe: pe(45, 38), sector: sector(24) }), "weak", VV.pricier],
    ["P/E 20 vs own 30 -> Cheaper than usual", val({ pe: pe(20, 30), sector: sector(30) }), "strong", VV.cheaper],
    ["cheaper than its own history but above the sector -> still Cheaper than usual (the verdict is about its own history)", val({ pe: pe(20, 30), sector: sector(15) }), "strong", VV.cheaper],
    ["NVDA: 28x vs its own 61 -> Cheaper than usual, not 'Cheap'", val({ pe: pe(28, 61), market: market(39, 15) }), "strong", VV.cheaper],
    [`exactly ${V.cheapRatio} x its average counts as cheaper than usual (boundary)`, val({ pe: pe(V.cheapRatio * 40, 40) }), "strong", VV.cheaper],
    [`exactly ${V.expensiveRatio} x its average counts as pricier than usual (boundary)`, val({ pe: pe(V.expensiveRatio * 40, 40) }), "weak", VV.pricier],
    ["just inside the band is About usual", val({ pe: pe(0.86 * 40, 40) }), "mixed", VV.usual],
    ["too few sector peers are ignored", val({ pe: pe(30, 30), sector: sector(10, V.minSectorPeers - 1) }), "mixed", VV.usual],
    ["no own history -> not enough history, even with peers and the market (no 'usual' invented)", val({ pe: pe(30, null), sector: sector(20), market: market(39, 15) }), "not_applicable", "Not enough history"],
    ["no history and no peers -> not enough history (no verdict invented)", val({ pe: pe(30, null) }), "not_applicable", "Not enough history"],
    ["no profit: free-cash-flow yield 6% -> High cash yield", val({ fcfYield: 0.06 }), "strong", VV.highCash],
    ["no profit: yield exactly 5% -> High cash yield (boundary)", val({ fcfYield: V.fcfYieldCheap }), "strong", VV.highCash],
    ["no profit: yield 3% -> Modest cash yield", val({ fcfYield: 0.03 }), "mixed", VV.modestCash],
    ["no profit, burning cash -> Low cash yield", val({ fcfYield: -0.02 }), "weak", VV.lowCash],
    ["no profit and no cash-flow figure -> not available", val({}), "not_applicable", "Not available"],
  ];
  for (const [name, input, level, verdict] of valuationTable) {
    const d = valuationDimension(input);
    check(`price vs profit: ${name}`, is(d, level, verdict), show(d));
  }
  const bargainWords = /\b(cheap|bargain|undervalued|expensive|overvalued)\b/i;
  const allValuation = valuationTable.map(([, input]) => valuationDimension(input));
  check(
    "price vs profit never says 'cheap', 'expensive' or 'bargain' (verdicts and sentences)",
    allValuation.every((d) => !bargainWords.test(d.verdict) && !bargainWords.test(d.sentence)),
    allValuation.filter((d) => bargainWords.test(`${d.verdict} ${d.sentence}`)).map(show).join(" | ") || "none",
  );
  const nv = valuationDimension(val({ pe: pe(45, 38), sector: sector(24) }));
  check(
    "price vs profit sentence uses real numbers and no jargon ('P/E' is not used)",
    nv.sentence === "The share costs 45 times the company's yearly profit, higher than its own 5-year average of 38. For comparison, similar companies average 24." && !/P\/E/.test(nv.sentence),
    nv.sentence,
  );
  const nvda = valuationDimension(val({ pe: pe(28, 61), market: market(39, 15) }));
  check(
    "NVDA sentence: relative to its own history, plus the tracked market",
    nvda.sentence === "The share costs 28 times the company's yearly profit, lower than its own 5-year average of 61. For comparison, the middle figure across the 15 companies Cairn tracks is 39.",
    nvda.sentence,
  );
  const both = valuationDimension(val({ pe: pe(24, 23), sector: sector(21), market: market(39, 15) }));
  check(
    "sector and tracked market both quoted when both qualify",
    both.verdict === VV.usual && /about the same as its own 5-year average of 23\. For comparison, similar companies average 21; the middle figure across the 15 companies Cairn tracks is 39\.$/.test(both.sentence),
    both.sentence,
  );
  const fewMarket = valuationDimension(val({ pe: pe(28, 61), market: market(39, V.minMarketCompanies - 1) }));
  check(
    `a tracked market under ${V.minMarketCompanies} companies is not quoted`,
    !/Cairn tracks/.test(fewMarket.sentence) && fewMarket.inputs.find((i) => i.label === "Companies Cairn tracks (median)")?.value === null,
    fewMarket.sentence,
  );
  check(
    "market median: positive P/Es only, null under the minimum",
    marketMedianPe([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, null, -5, 0])?.median === 55 &&
      marketMedianPe([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, null, -5, 0])?.companies === 10 &&
      marketMedianPe([10, 20, 30]) === null,
    JSON.stringify(marketMedianPe([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, null, -5, 0])),
  );

  // ---- growth -------------------------------------------------------------
  const G = THRESHOLDS.growth;
  const growthTable: [string, CompanyMetrics | null, string, string, RegExp?][] = [
    ["sales +56%, profit +61% -> Strong", metrics({ revenueGrowth: 0.56, netIncomeGrowth: 0.61 }), "strong", "Strong", /^Sales are up 56% on last year, and profit is up 61%\./],
    [`sales exactly +${G.strongRevenue * 100}% -> Strong (boundary)`, metrics({ revenueGrowth: G.strongRevenue, netIncomeGrowth: 0.05 }), "strong", "Strong"],
    ["sales +9.9% -> Steady", metrics({ revenueGrowth: 0.099 }), "mixed", "Steady"],
    ["sales +20% but profit down -> Steady", metrics({ revenueGrowth: 0.2, netIncomeGrowth: -0.1 }), "mixed", "Steady", /but profit is down 10%/],
    ["sales exactly 0% -> Steady (boundary)", metrics({ revenueGrowth: 0 }), "mixed", "Steady"],
    ["sales -3% -> Shrinking", metrics({ revenueGrowth: -0.03 }), "weak", "Shrinking", /^Sales are down 3% on last year/],
    ["no two-year history -> not available", metrics({ revenueGrowth: null }), "not_applicable", "Not available"],
    ["no metrics at all -> not available", null, "not_applicable", "Not available"],
  ];
  for (const [name, m, level, verdict, re] of growthTable) {
    const d = growthDimension(m, FILING);
    check(`growth: ${name}`, is(d, level, verdict) && (!re || re.test(d.sentence)), show(d));
  }
  const speeding = growthDimension(metrics({ revenueGrowthLatestQuarter: 0.4, revenueGrowthPriorQuarter: 0.3 }), FILING);
  const slowing = growthDimension(metrics({ revenueGrowthLatestQuarter: 0.56, revenueGrowthPriorQuarter: 1.2 }), FILING);
  const steadyPace = growthDimension(metrics({ revenueGrowthLatestQuarter: 0.31, revenueGrowthPriorQuarter: 0.3 }), FILING);
  check(
    "growth: speeding up / slowing / steady pace (3-point band)",
    /speeding up/.test(speeding.sentence) && /slowing/.test(slowing.sentence) && /pace is steady/.test(steadyPace.sentence),
    [speeding, slowing, steadyPace].map((d) => d.sentence.split(". ").pop()).join(" | "),
  );

  // ---- financial health ---------------------------------------------------
  const H = THRESHOLDS.health;
  const healthTable: [string, CompanyMetrics, string, string][] = [
    ["cash-positive, more cash than debt -> Strong", metrics(), "strong", "Strong"],
    [`net debt ${H.strongNetDebtToEbitda - 0.1}x EBITDA -> Strong`, metrics({ netDebt: 1.4 * 450, netDebtToEbitda: 1.4 }), "strong", "Strong"],
    [`net debt exactly ${H.strongNetDebtToEbitda}x -> OK (boundary)`, metrics({ netDebt: 1.5 * 450, netDebtToEbitda: 1.5 }), "mixed", "OK"],
    [`net debt exactly ${H.stretchedNetDebtToEbitda}x -> OK (boundary)`, metrics({ netDebt: 3.5 * 450, netDebtToEbitda: 3.5 }), "mixed", "OK"],
    ["net debt 3.6x -> Stretched", metrics({ netDebt: 3.6 * 450, netDebtToEbitda: 3.6 }), "weak", "Stretched"],
    ["negative free cash flow -> Stretched", metrics({ ttm: { free_cash_flow: -10 } }), "weak", "Stretched"],
    ["no debt figure reported -> OK, not assumed debt-free", metrics({ netDebt: null, netDebtToEbitda: null }), "mixed", "OK"],
  ];
  for (const [name, m, level, verdict] of healthTable) {
    const d = healthDimension(m, FILING);
    check(`health: ${name}`, is(d, level, verdict), show(d));
  }
  const hs = healthDimension(metrics({ ebitdaMargin: 0.52 }), FILING);
  check(
    "health: EBITDA is explained where it is used",
    hs.sentence.startsWith("Keeps 52 cents of every dollar of sales as EBITDA (profit before interest, tax and write-downs).") && /more cash than debt/.test(hs.sentence),
    hs.sentence,
  );
  check("health: no EBITDA and no operating profit -> not available", healthDimension(metrics({ ttm: { ebitda: null, operating_income: null } }), FILING).verdict === "Not available", "ebitda + operating income null");
  check("health: no EBITDA but operating profit -> rated on operating profit, and says so", (() => { const d = healthDimension(metrics({ ttm: { ebitda: null } }), FILING); return d.verdict !== "Not available" && /operating profit/.test(d.sentence) && !/EBITDA/.test(d.sentence); })(), "ebitda null, operating income present");

  // ---- dividend -----------------------------------------------------------
  const base = { price: 60, freeCashFlow: 1000, growthYears: 12, filing: FILING };
  const divTable: [string, Parameters<typeof dividendDimension>[0], string, string][] = [
    ["no dividend -> None", { ...base, perShareTtm: null, payoutOfFcf: null }, "not_applicable", "None"],
    ["yield 0.02% -> Tiny (not rated)", { ...base, price: 180, perShareTtm: 0.04, payoutOfFcf: 0.01 }, "not_applicable", "Tiny"],
    ["payout 55% of FCF -> Well covered", { ...base, perShareTtm: 1.8, payoutOfFcf: 0.55 }, "strong", "Well covered"],
    ["payout exactly 60% -> Well covered (boundary)", { ...base, perShareTtm: 1.8, payoutOfFcf: 0.6 }, "strong", "Well covered"],
    ["payout 75% -> Tight", { ...base, perShareTtm: 1.8, payoutOfFcf: 0.75 }, "mixed", "Tight"],
    ["payout exactly 90% -> Tight (boundary)", { ...base, perShareTtm: 1.8, payoutOfFcf: 0.9 }, "mixed", "Tight"],
    ["payout 120% -> At risk", { ...base, perShareTtm: 1.8, payoutOfFcf: 1.2 }, "weak", "At risk"],
    ["no free cash flow -> At risk", { ...base, perShareTtm: 1.8, payoutOfFcf: null, freeCashFlow: -50 }, "weak", "At risk"],
    ["cash-flow figures missing -> not rated", { ...base, perShareTtm: 1.8, payoutOfFcf: null, freeCashFlow: null }, "not_applicable", "Not available"],
  ];
  for (const [name, input, level, verdict] of divTable) {
    const d = dividendDimension(input);
    check(`dividend: ${name}`, is(d, level, verdict), show(d));
  }
  const ko = dividendDimension({ ...base, perShareTtm: 1.94, price: 68, payoutOfFcf: 0.75 });
  check(
    "dividend: sentence has yield, coverage with the term explained, and the streak",
    ko.sentence === "Pays 2.9% a year. The payments use 75% of its free cash flow (cash left after running and investing in the business). It has raised it 12 years in a row.",
    ko.sentence,
  );
  const tiny = dividendDimension({ ...base, price: 180, perShareTtm: 0.04, payoutOfFcf: 0.01 });
  check("dividend: a 0.02% yield reads 0.02%, never 0.0%", tiny.sentence.startsWith("Pays 0.02% a year."), tiny.sentence);

  // ---- price trend --------------------------------------------------------
  const tr = (r: number | null, v: number | null) => trendDimension({ return6m: r, vs200d: v, asOf: "2025-09-25" });
  const trendTable: [string, Dimension, string, string][] = [
    ["+34%, above the 200-day average -> Rising", tr(0.34, 0.12), "strong", "Rising"],
    ["-20%, below the average -> Falling", tr(-0.2, -0.1), "weak", "Falling"],
    ["+20% but below the average -> Sideways", tr(0.2, -0.01), "mixed", "Sideways"],
    ["exactly +5% -> Sideways (boundary)", tr(THRESHOLDS.trend.sixMonthMove, 0.05), "mixed", "Sideways"],
    ["less than 6 months of prices -> not available", tr(null, null), "not_applicable", "Not available"],
  ];
  for (const [name, d, level, verdict] of trendTable) check(`trend: ${name}`, is(d, level, verdict), show(d));
  check(
    "trend: the 200-day average is described in words",
    tr(0.34, 0.12).sentence === "Up 34% over 6 months, and 12% above its average price of the last 200 trading days.",
    tr(0.34, 0.12).sentence,
  );

  // Six months is 126 trading sessions for a share but about 183 days for a
  // coin, which trades every day. The factor engine's 126-bar change is only
  // about four months of a coin's prices, so the scorecard measures six
  // months itself from the bars, using the asset's own periods per year.
  const factorSet = (periodsPerYear: number, closes: number[], pctVsSma200: number): FactorSet =>
    ({
      symbol: "X",
      asOf: "2026-09-26",
      barCount: closes.length,
      periodsPerYear,
      readings: [
        { key: "trend", detail: { pct_vs_sma200: pctVsSma200 } },
        { key: "momentum_3m", detail: { roc_6m_pct: 999 } },
      ],
      series: {},
      bars: closes.map((close, i) => ({ date: `d${i}`, open: close, high: close, low: close, close, volume: 0 })),
    }) as unknown as FactorSet;
  // 400 bars rising by 1 a bar: the close 6 months back is known exactly.
  const ramp = Array.from({ length: 400 }, (_, i) => 100 + i);
  const coin = trendInputsFromFactorSet(factorSet(365, ramp, 5));
  check(
    "trend: a coin's 6 months is 183 daily bars, not 126",
    coin.return6m !== null && Math.abs(coin.return6m - (499 / (499 - 183) - 1)) < 1e-12 && coin.dailyBars === true,
    JSON.stringify(coin),
  );
  const share = trendInputsFromFactorSet(factorSet(252, ramp, 5));
  check(
    "trend: a share's 6 months is 126 trading sessions",
    share.return6m !== null && Math.abs(share.return6m - (499 / (499 - 126) - 1)) < 1e-12 && share.dailyBars === false && share.vs200d === 0.05,
    JSON.stringify(share),
  );
  check(
    "trend: a coin's 200-bar average is described as 200 days, not trading days",
    trendDimension({ return6m: 0.34, vs200d: 0.12, asOf: "2026-09-26", dailyBars: true }).sentence ===
      "Up 34% over 6 months, and 12% above its average price of the last 200 days.",
    trendDimension({ return6m: 0.34, vs200d: 0.12, asOf: "2026-09-26", dailyBars: true }).sentence,
  );
  check("trend: no factor set means not available", trendInputsFromFactorSet(null).return6m === null, "null");

  // ---- next event ---------------------------------------------------------
  const cal = (date: string, type: "earnings" | "ex_dividend" = "earnings") => ({ type, date, source: { kind: "calendar" as const, label: "Nasdaq earnings calendar", ref: date } });
  const reacts = [0.08, -0.07, 0.03, 0.09, -0.02, 0.065, 0.011, -0.12].map((m, i) => ({ release_date: `2025-0${(i % 9) + 1}-10`, reaction_date: `2025-0${(i % 9) + 1}-11`, move: m }));
  const ne = nextEventDimension("2025-09-26", [cal("2025-10-01"), cal("2025-11-20")], reacts);
  check(
    "next event: the nearest date, in days, with past results-day moves",
    ne.verdict === "Earnings in 5 days" && ne.rated === false && /On its last 8 results days the share moved 5% or more 5 times; the typical move was 6\.8%\./.test(ne.sentence),
    `${ne.verdict}: ${ne.sentence}`,
  );
  check(
    "next event: fewer than 4 past moves are not summarised",
    !/results days/.test(nextEventDimension("2025-09-26", [cal("2025-10-01")], reacts.slice(0, 3)).sentence),
    nextEventDimension("2025-09-26", [cal("2025-10-01")], reacts.slice(0, 3)).sentence,
  );
  check(
    "next event: past dates and dates beyond 60 days are ignored",
    nextEventDimension("2025-09-26", [cal("2025-09-20"), cal("2025-12-01")], []).verdict === NO_EVENT_VERDICT,
    nextEventDimension("2025-09-26", [cal("2025-09-20"), cal("2025-12-01")], []).sentence,
  );
  // An empty calendar is a fact about Cairn's calendar, not about the world:
  // the ingest only looks a few weeks ahead and can fail, so the tile names
  // its source and the reach it actually has.
  const none = nextEventDimension("2025-09-26", [], []);
  check(
    "next event: nothing found is attributed to Cairn's calendar and its real reach",
    none.verdict === "None in calendar" && none.sentence === `Cairn's calendar has no earnings or dividend dates for it in the next ${THRESHOLDS.nextEvent.calendarLooksAheadDays} days.`,
    `${none.verdict}: ${none.sentence}`,
  );
  check(
    "next event: an empty tile is not an upcoming event, a dated one is",
    !hasUpcomingEvent(none) && hasUpcomingEvent(ne) && !hasUpcomingEvent(tr(0.34, 0.12)),
    `${hasUpcomingEvent(none)} ${hasUpcomingEvent(ne)}`,
  );
  const ingestSrc = fs.readFileSync(path.join(process.cwd(), "supabase/functions/ingest-calendar/index.ts"), "utf8");
  const daysAhead = Number(/const DAYS_AHEAD = (\d+);/.exec(ingestSrc)?.[1]);
  check(
    "next event: the stated reach matches how far ingest-calendar fetches",
    daysAhead === THRESHOLDS.nextEvent.calendarLooksAheadDays,
    `ingest DAYS_AHEAD=${daysAhead}, scorecard=${THRESHOLDS.nextEvent.calendarLooksAheadDays}`,
  );
  const exd = nextEventDimension("2025-09-26", [cal("2025-09-27", "ex_dividend")], []);
  check("next event: a dividend cut-off date is explained", exd.verdict === "Dividend cut-off date tomorrow" && /Only shares owned before this day/.test(exd.sentence), exd.sentence);

  // ---- the whole card, crypto and ETFs -------------------------------------
  const common: Omit<ScorecardInput, "symbol" | "assetType" | "companyData"> = {
    today: "2025-09-26",
    metrics: null,
    valuation: val({}),
    dividend: { perShareTtm: null, price: null, payoutOfFcf: null, freeCashFlow: null, growthYears: null, filing: null },
    trend: { return6m: -0.09, vs200d: -0.04, asOf: "2025-09-26" },
    events: [],
    reactions: [],
    filing: null,
  };
  const btc = buildScorecard({ ...common, symbol: "BTC", assetType: "crypto", companyData: "not_applicable" });
  check(
    "crypto: company dimensions are not applicable, trend and next event still work",
    btc.dimensions.length === 6 &&
      btc.dimensions.slice(0, 4).every((d) => d.level === "not_applicable" && /no company behind it/.test(d.sentence)) &&
      btc.dimensions[4].verdict === "Falling" &&
      btc.dimensions[5].key === "next_event",
    btc.dimensions.map((d) => `${d.key}:${d.verdict}`).join(", "),
  );
  const spy = buildScorecard({ ...common, symbol: "SPY", assetType: "etf", companyData: "not_applicable" });
  check("ETF: company dimensions say it is a fund", spy.dimensions[0].sentence.startsWith("A fund holds many companies"), spy.dimensions[0].sentence);
  check(
    "no verdict anywhere says bullish/bearish/buy/sell/hold",
    [...btc.dimensions, ...spy.dimensions, ...Object.values(snapshotCards()).flatMap((c) => c.dimensions)].every((d) => !/\b(bullish|bearish|bull|bear|buy|sell|hold)\b/i.test(`${d.verdict} ${d.sentence}`)),
    "checked all verdicts and sentences",
  );
  check("bars: strong 3, mixed 2, weak 1, not applicable 0", [barSegments("strong"), barSegments("mixed"), barSegments("weak"), barSegments("not_applicable")].join() === "3,2,1,0", "3,2,1,0");
  check(
    "sector median needs the minimum number of profitable peers",
    sectorMedianPe([20, 24, 30, null, -5]) === null && sectorMedianPe([20, 24, 30, 18, 40, -5])?.median === 24,
    `${JSON.stringify(sectorMedianPe([20, 24, 30, 18, 40, -5]))}`,
  );

  // ---- every sentence's numbers are listed in its inputs -----------------------
  const cards = snapshotCards();
  const numberTokens = (s: string) => s.match(/\d+(?:\.\d+)?%?/g) ?? [];
  const missing: string[] = [];
  for (const card of Object.values(cards)) {
    for (const d of card.dimensions) {
      const shown = new Set(d.inputs.map((i) => i.display).filter((x): x is string => !!x).flatMap(numberTokens));
      for (const tok of numberTokens(d.sentence)) {
        // Dates and fixed wording ("6 months", "200 trading days", "200 days", "5-year") are not data.
        if (/^(6|200|5|12|60|21)$/.test(tok) && /(6 months|200 (trading )?days|5-year|in the next \d+ days)/.test(d.sentence)) continue;
        if (!shown.has(tok) && !shown.has(tok.replace("%", ""))) missing.push(`${card.symbol}.${d.key}: "${tok}" in "${d.sentence}"`);
      }
    }
  }
  check("every number in a sentence appears in that dimension's inputs", missing.length === 0, missing.join(" | ") || "all present");

  // ---- snapshot -------------------------------------------------------------
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "scorecard-snapshots.json");
  const current = JSON.stringify(cards, null, 2) + "\n";
  if (opts.update || !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, current);
    check("snapshot written", true, path.relative(process.cwd(), file));
  } else {
    const stored = fs.readFileSync(file, "utf8");
    check("full scorecards match the reviewed snapshot (grower, dividend payer, coin)", stored === current, stored === current ? "identical" : "differs: rerun with --update after reviewing the diff");
  }

  return { suiteName: "Scorecard (six plain-language dimensions)", gating: true, cases };
}

/** Three synthetic companies, used for the snapshot. */
export function snapshotCards() {
  const today = "2025-09-26";
  const earnings = { type: "earnings" as const, date: "2025-10-01", source: { kind: "calendar" as const, label: "Nasdaq earnings calendar", ref: "2025-10-01" } };
  const grower = buildScorecard({
    symbol: "GROW",
    assetType: "equity",
    today,
    companyData: "available",
    metrics: metrics({ revenueGrowth: 0.56, netIncomeGrowth: 0.61, revenueGrowthLatestQuarter: 0.56, revenueGrowthPriorQuarter: 1.2, ebitdaMargin: 0.52 }),
    valuation: val({ pe: pe(45, 38), sector: sector(24), market: market(39, 15) }),
    dividend: { perShareTtm: 0.04, price: 176.4, payoutOfFcf: 0.01, freeCashFlow: 360, growthYears: 0, filing: FILING },
    trend: { return6m: 0.34, vs200d: 0.12, asOf: today },
    events: [earnings],
    reactions: [0.08, -0.07, 0.03, 0.09, -0.02, 0.065, 0.011, -0.12].map((m, i) => ({ release_date: `2025-0${i + 1}-10`, reaction_date: `2025-0${i + 1}-11`, move: m })),
    filing: FILING,
  });
  const payer = buildScorecard({
    symbol: "PAYR",
    assetType: "equity",
    today,
    companyData: "available",
    metrics: metrics({ revenueGrowth: 0.03, netIncomeGrowth: 0.05, revenueGrowthLatestQuarter: 0.02, revenueGrowthPriorQuarter: 0.03, ebitdaMargin: 0.33, netDebt: 2.6 * 450, netDebtToEbitda: 2.6 }),
    valuation: val({ pe: pe(24, 23), sector: sector(21) }),
    dividend: { perShareTtm: 1.94, price: 68, payoutOfFcf: 0.75, freeCashFlow: 360, growthYears: 12, filing: FILING },
    trend: { return6m: 0.02, vs200d: 0.01, asOf: today },
    events: [{ type: "ex_dividend", date: "2025-10-10", source: { kind: "calendar", label: "Nasdaq dividend calendar", ref: "2025-10-10" } }],
    reactions: [],
    filing: FILING,
  });
  const coin = buildScorecard({
    symbol: "BTC",
    assetType: "crypto",
    today,
    companyData: "not_applicable",
    metrics: null,
    valuation: val({}),
    dividend: { perShareTtm: null, price: null, payoutOfFcf: null, freeCashFlow: null, growthYears: null, filing: null },
    trend: { return6m: -0.09, vs200d: -0.04, asOf: today, dailyBars: true },
    events: [],
    reactions: [],
    filing: null,
  });
  return { GROW: grower, PAYR: payer, BTC: coin };
}

function main() {
  const suite = runScorecardSuite({ update: process.argv.includes("--update") });
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
