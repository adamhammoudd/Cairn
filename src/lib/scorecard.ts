// The scorecard: six plain-language descriptions of a ticker's numbers.
//
// Pure and deterministic. No model is involved: every level, verdict and
// sentence here is computed from stored filings and prices, and the same
// inputs always give the same card. These are DESCRIPTIONS of the numbers,
// not predictions and not advice: nothing here says bullish/bearish or
// buy/sell. The only forward-looking element in an analysis stays the analog
// engine (src/lib/ai/analytics.ts, factors.ts).
//
// Every dimension returns its inputs (with the exact strings its sentence
// uses, so the plain summary's number guard can check against them) and its
// sources (a filing, a price date, a release), so no number is bare.

import type { CompanyMetrics, PeHistory, EarningsReaction } from "@/lib/fundamentals";
import { median } from "@/lib/fundamentals";
import type { FactorSet } from "@/lib/ai/factors";

export type Level = "strong" | "mixed" | "weak" | "not_applicable";

export type DimensionKey = "valuation" | "growth" | "health" | "dividend" | "trend" | "next_event";

export interface Input {
  label: string;
  value: number | null;
  /** Exactly as it appears in the sentence, e.g. "56%" or "45". */
  display: string | null;
}

export interface Source {
  kind: "sec_filing" | "price_history" | "earnings_release" | "calendar" | "computed";
  label: string;
  /** Accession number, date or row reference the figure traces to. */
  ref?: string;
  url?: string;
}

export interface Dimension {
  key: DimensionKey;
  label: string;
  level: Level;
  /**
   * False for "Next event", which is a date, not a quality: it is drawn as a
   * pill, never as a strong/weak bar.
   */
  rated: boolean;
  verdict: string;
  sentence: string;
  inputs: Input[];
  sources: Source[];
}

export interface Scorecard {
  symbol: string;
  asOf: string;
  dimensions: Dimension[];
}

// ------------------------------------------------------------- thresholds
//
// [DECISION: Adam] Proposed values. Simple, explainable, and deliberately NOT
// tuned to backtests: they describe the numbers in words an investor would
// use, they do not try to predict anything.

export const THRESHOLDS = {
  valuation: {
    /** P/E at most 15% below a comparison counts as cheap against it: a gap smaller than that is noise in one quarter's profit. */
    cheapRatio: 0.85,
    /** P/E at least 15% above a comparison counts as expensive against it, symmetric with cheap. */
    expensiveRatio: 1.15,
    /** Sector median needs this many profitable tracked peers, or it is not quoted: fewer is an anecdote. */
    minSectorPeers: 5,
    /** When there is no profit, free-cash-flow yield at or above this is cheap: roughly what a long government bond pays. */
    fcfYieldCheap: 0.05,
    /** Below this free-cash-flow yield is expensive: under 2% the price assumes a lot of future growth. */
    fcfYieldExpensive: 0.02,
  },
  growth: {
    /** Sales growth at or above 10% a year is strong: roughly double nominal economic growth. */
    strongRevenue: 0.1,
    /** Below 0% sales are shrinking. Between the two is steady. */
    shrinkingRevenue: 0,
    /** A quarter's growth rate more than 3 points above/below the previous quarter's is "speeding up"/"slowing". */
    accelerationPoints: 0.03,
  },
  health: {
    /** Strong: cash-generating and debt under 1.5 years of EBITDA - it could pay its debt from 18 months of profit. */
    strongNetDebtToEbitda: 1.5,
    /** Stretched: debt above 3.5 years of EBITDA, the level lenders commonly treat as high. */
    stretchedNetDebtToEbitda: 3.5,
  },
  dividend: {
    /** Yields below 0.5% are too small to matter to an income investor: shown as "Tiny", not rated. */
    tinyYield: 0.005,
    /** Paying out up to 60% of free cash flow leaves room for a bad year: well covered. */
    wellCoveredPayout: 0.6,
    /** Above 90% of free cash flow (or with no free cash flow) the dividend is at risk. Between is tight. */
    atRiskPayout: 0.9,
  },
  trend: {
    /** A 6-month move beyond +/-5% counts as a direction; inside it is sideways. */
    sixMonthMove: 0.05,
  },
  nextEvent: {
    /** Events further out than this are not "next" enough to mention. */
    horizonDays: 60,
    /**
     * How far ahead Cairn's calendar is filled: ingest-calendar fetches this
     * many days (its DAYS_AHEAD; a test keeps the two equal). An empty result
     * is only ever stated for this reach, never for the full horizon.
     */
    calendarLooksAheadDays: 21,
    /** An earnings-day move of 5% or more counts as a big move in the history sentence. */
    bigMove: 0.05,
    /** Fewer past reactions than this are not summarised. */
    minReactions: 4,
    /** At most this many past reactions are counted. */
    maxReactions: 12,
  },
} as const;

// ------------------------------------------------------------- formatting

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const signedPct = (v: number) => `${v >= 0 ? "+" : "-"}${pct(v)}`;
const times = (v: number) => `${Math.round(v)}`;
const oneDp = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

function input(label: string, value: number | null, display: string | null): Input {
  return { label, value, display };
}

const NA = (key: DimensionKey, label: string, sentence: string, verdict = "Not applicable"): Dimension => ({
  key,
  label,
  level: "not_applicable",
  rated: key !== "next_event",
  verdict,
  sentence,
  inputs: [],
  sources: [],
});

export interface FilingRef {
  accn: string;
  form: string;
  filed: string;
  cik: string;
}

export function filingUrl(f: FilingRef): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(f.cik)}/${f.accn.replace(/-/g, "")}/`;
}

function filingSource(f: FilingRef | null, what: string): Source[] {
  if (!f) return [];
  return [{ kind: "sec_filing", label: `${f.form} filed ${f.filed} (${what})`, ref: f.accn, url: filingUrl(f) }];
}

// ------------------------------------------------------------- dimensions

export interface ValuationInput {
  pe: PeHistory | null;
  /** Median current P/E of profitable tracked peers in the same sector. */
  sector: { median: number; peers: number; name: string } | null;
  /** TTM free cash flow / market value, for companies without profit. */
  fcfYield: number | null;
  priceDate: string | null;
  filing: FilingRef | null;
}

export function valuationDimension(v: ValuationInput): Dimension {
  const label = "Price vs profit";
  const T = THRESHOLDS.valuation;
  const cur = v.pe?.current ?? null;
  const sources: Source[] = [
    ...filingSource(v.filing, "profit per share"),
    ...(v.priceDate ? [{ kind: "price_history" as const, label: `Closing price ${v.priceDate}`, ref: v.priceDate }] : []),
  ];

  if (cur) {
    const own = v.pe?.fiveYearAverage ?? null;
    const sector = v.sector && v.sector.peers >= T.minSectorPeers ? v.sector : null;
    const score = (ratio: number) => (ratio <= T.cheapRatio ? 1 : ratio >= T.expensiveRatio ? -1 : 0);
    const scores: number[] = [];
    if (own) scores.push(score(cur.pe / own));
    if (sector) scores.push(score(cur.pe / sector.median));
    const inputs = [
      input("Price ÷ yearly profit per share", cur.pe, times(cur.pe)),
      input("Its 5-year average", own, own ? times(own) : null),
      input("Similar companies (median)", sector?.median ?? null, sector ? times(sector.median) : null),
      input("Similar companies counted", sector?.peers ?? null, sector ? String(sector.peers) : null),
    ];
    if (scores.length === 0) {
      return {
        key: "valuation",
        label,
        level: "not_applicable",
        rated: true,
        verdict: "Not enough history",
        sentence: `The share costs ${times(cur.pe)} times its yearly profit. There is not enough history yet to compare that.`,
        inputs,
        sources,
      };
    }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const verdict = avg >= 0.5 ? "Cheap" : avg <= -0.5 ? "Expensive" : "Fair";
    const level: Level = verdict === "Cheap" ? "strong" : verdict === "Fair" ? "mixed" : "weak";
    const compare = [own ? `its 5-year average is ${times(own)}` : null, sector ? `similar companies average ${times(sector.median)}` : null]
      .filter(Boolean)
      .join("; ");
    return {
      key: "valuation",
      label,
      level,
      rated: true,
      verdict,
      sentence: `The share costs ${times(cur.pe)} times the company's yearly profit. For comparison, ${compare}.`,
      inputs,
      sources,
    };
  }

  // No profit: fall back to free-cash-flow yield.
  if (v.fcfYield !== null) {
    const verdict = v.fcfYield >= T.fcfYieldCheap ? "Cheap" : v.fcfYield < T.fcfYieldExpensive ? "Expensive" : "Fair";
    const level: Level = verdict === "Cheap" ? "strong" : verdict === "Fair" ? "mixed" : "weak";
    const sentence =
      v.fcfYield <= 0
        ? "It has no yearly profit and burns cash, so the price rests on future results."
        : `It has no yearly profit. Its spare cash each year is ${pct(v.fcfYield)} of the share price.`;
    return {
      key: "valuation",
      label,
      level,
      rated: true,
      verdict,
      sentence,
      inputs: [input("Free cash flow ÷ market value", v.fcfYield, v.fcfYield > 0 ? pct(v.fcfYield) : null)],
      sources,
    };
  }
  return NA("valuation", label, "Profit or cash-flow figures are not available for this company.", "Not available");
}

export function growthDimension(m: CompanyMetrics | null, filing: FilingRef | null): Dimension {
  const label = "Growth";
  const T = THRESHOLDS.growth;
  if (!m || m.revenueGrowth === null) return NA("growth", label, "A full two years of sales figures are not available.", "Not available");
  const r = m.revenueGrowth;
  const p = m.netIncomeGrowth;
  const verdict = r >= T.strongRevenue && (p === null || p >= 0) ? "Strong" : r < T.shrinkingRevenue ? "Shrinking" : "Steady";
  const level: Level = verdict === "Strong" ? "strong" : verdict === "Steady" ? "mixed" : "weak";

  const sales = r >= 0 ? `Sales are up ${pct(r)} on last year` : `Sales are down ${pct(r)} on last year`;
  const profit = p === null ? "" : p >= 0 ? `, and profit is up ${pct(p)}` : `, but profit is down ${pct(p)}`;
  let pace = "";
  const a = m.revenueGrowthLatestQuarter;
  const b = m.revenueGrowthPriorQuarter;
  if (a !== null && b !== null) {
    pace = a - b > T.accelerationPoints ? " Growth is speeding up." : b - a > T.accelerationPoints ? " Growth is slowing." : " The pace is steady.";
  }
  return {
    key: "growth",
    label,
    level,
    rated: true,
    verdict,
    sentence: `${sales}${profit}.${pace}`,
    inputs: [
      input("Sales growth, last 12 months vs the 12 before", r, pct(r)),
      input("Profit growth, last 12 months vs the 12 before", p, p === null ? null : pct(p)),
      input("Latest quarter's sales growth vs a year earlier", a, a === null ? null : signedPct(a)),
      input("Previous quarter's sales growth vs a year earlier", b, b === null ? null : signedPct(b)),
    ],
    sources: filingSource(filing, "sales and profit"),
  };
}

export function healthDimension(m: CompanyMetrics | null, filing: FilingRef | null): Dimension {
  const label = "Financial health";
  const T = THRESHOLDS.health;
  if (!m || m.ttm.ebitda === null || m.ttm.free_cash_flow === null || m.ttm.revenue === null) {
    return NA("health", label, "Profit and cash-flow figures are not complete for this company.", "Not available");
  }
  const fcf = m.ttm.free_cash_flow;
  const nd = m.netDebt;
  const lev = m.netDebtToEbitda;
  const verdict =
    fcf <= 0 || m.ttm.ebitda <= 0 || (lev !== null && lev > T.stretchedNetDebtToEbitda)
      ? "Stretched"
      : fcf > 0 && nd !== null && (nd <= 0 || (lev !== null && lev < T.strongNetDebtToEbitda))
        ? "Strong"
        : "OK";
  const level: Level = verdict === "Strong" ? "strong" : verdict === "OK" ? "mixed" : "weak";

  const margin = m.ebitdaMargin;
  const parts: string[] = [];
  if (margin !== null && margin > 0) {
    parts.push(`Keeps ${Math.round(margin * 100)} cents of every dollar of sales as EBITDA (profit before interest, tax and write-downs).`);
  } else {
    parts.push("It makes no EBITDA (profit before interest, tax and write-downs).");
  }
  parts.push(fcf > 0 ? "It brings in more cash than it spends." : "It spent more cash than it brought in last year.");
  if (nd !== null) {
    if (nd <= 0) parts.push("It has more cash than debt.");
    else if (lev !== null) parts.push(`Its debt minus its cash equals ${oneDp(lev)} years of EBITDA.`);
  }
  return {
    key: "health",
    label,
    level,
    rated: true,
    verdict,
    sentence: parts.join(" "),
    inputs: [
      input("EBITDA margin", margin, margin !== null && margin > 0 ? String(Math.round(margin * 100)) : null),
      input("Free cash flow, last 12 months (USD)", fcf, null),
      input("Net debt (USD)", nd, null),
      input("Net debt ÷ EBITDA", lev, lev !== null && nd !== null && nd > 0 ? oneDp(lev) : null),
    ],
    sources: filingSource(filing, "EBITDA, cash flow and debt"),
  };
}

export interface DividendInput {
  /** Dividends per share, last 12 months. */
  perShareTtm: number | null;
  price: number | null;
  payoutOfFcf: number | null;
  freeCashFlow: number | null;
  growthYears: number | null;
  filing: FilingRef | null;
}

export function dividendDimension(d: DividendInput): Dimension {
  const label = "Dividend";
  const T = THRESHOLDS.dividend;
  if (d.perShareTtm === null || d.perShareTtm <= 0) {
    return {
      key: "dividend",
      label,
      level: "not_applicable",
      rated: true,
      verdict: "None",
      sentence: "It does not pay a dividend.",
      inputs: [],
      sources: filingSource(d.filing, "dividends"),
    };
  }
  if (d.price === null || d.price <= 0) return NA("dividend", label, "No current price to measure the dividend against.", "Not available");
  const yld = d.perShareTtm / d.price;
  // One decimal from 1% up; two below, so a 0.02% yield never reads "0.0%".
  const yieldDisplay = yld < 0.01 ? `${(yld * 100).toFixed(2)}%` : `${(yld * 100).toFixed(1)}%`;
  const inputs = [
    input("Dividend yield (last 12 months ÷ price)", yld, yieldDisplay),
    input("Share of free cash flow paid out", d.payoutOfFcf, d.payoutOfFcf === null ? null : pct(d.payoutOfFcf)),
    input("Years in a row the dividend rose", d.growthYears, d.growthYears === null ? null : String(d.growthYears)),
  ];
  const sources = filingSource(d.filing, "dividends and cash flow");
  if (yld < T.tinyYield) {
    return {
      key: "dividend",
      label,
      level: "not_applicable",
      rated: true,
      verdict: "Tiny",
      sentence: `Pays ${yieldDisplay} a year. It is a growth share, not an income share.`,
      inputs,
      sources,
    };
  }
  const coverage =
    d.freeCashFlow === null || d.payoutOfFcf === null
      ? d.freeCashFlow !== null && d.freeCashFlow <= 0
        ? "At risk"
        : null
      : d.payoutOfFcf <= T.wellCoveredPayout
        ? "Well covered"
        : d.payoutOfFcf <= T.atRiskPayout
          ? "Tight"
          : "At risk";
  if (coverage === null) {
    return { key: "dividend", label, level: "not_applicable", rated: true, verdict: "Not available", sentence: `Pays ${yieldDisplay} a year. Cash-flow figures are missing, so coverage can't be measured.`, inputs, sources };
  }
  const level: Level = coverage === "Well covered" ? "strong" : coverage === "Tight" ? "mixed" : "weak";
  const paid =
    d.payoutOfFcf !== null && d.freeCashFlow !== null && d.freeCashFlow > 0
      ? ` The payments use ${pct(d.payoutOfFcf)} of its free cash flow (cash left after running and investing in the business).`
      : " It has no free cash flow (cash left after running and investing in the business) to pay it from.";
  const streak = d.growthYears !== null && d.growthYears >= 2 ? ` It has raised it ${d.growthYears} years in a row.` : "";
  return { key: "dividend", label, level, rated: true, verdict: coverage, sentence: `Pays ${yieldDisplay} a year.${paid}${streak}`, inputs, sources };
}

export interface TrendInput {
  /** 6-month (126-session) return, fraction. */
  return6m: number | null;
  /** Price vs its 200-day average, fraction (+0.08 = 8% above). */
  vs200d: number | null;
  asOf: string | null;
  /**
   * True when the bars are every calendar day (crypto trades daily), so the
   * 200-bar average is 200 days rather than 200 trading days.
   */
  dailyBars?: boolean;
}

/**
 * Trend inputs from the existing factor engine (src/lib/ai/factors.ts).
 *
 * Six months is measured here from the bars, as half the asset's periods per
 * year: 126 sessions for a share, 183 days for a coin. The factor engine's
 * roc_6m_pct is a fixed 126 bars, which is only about four months of a coin's
 * daily prices, so it is not used for the "over 6 months" sentence.
 */
export function trendInputsFromFactorSet(set: FactorSet | null): TrendInput {
  if (!set) return { return6m: null, vs200d: null, asOf: null };
  const trend = set.readings.find((r) => r.key === "trend");
  const vs = trend?.detail.pct_vs_sma200;
  const lookback = Math.round(set.periodsPerYear / 2);
  const last = set.bars.length - 1;
  const past = last - lookback >= 0 ? set.bars[last - lookback].close : null;
  const return6m = past !== null && past > 0 ? set.bars[last].close / past - 1 : null;
  return {
    return6m,
    vs200d: typeof vs === "number" ? vs / 100 : null,
    asOf: set.asOf,
    dailyBars: set.periodsPerYear > 252,
  };
}

export function trendDimension(t: TrendInput): Dimension {
  const label = "Price trend";
  const T = THRESHOLDS.trend;
  if (t.return6m === null) return NA("trend", label, "Less than six months of prices are stored.", "Not available");
  const up = t.return6m > T.sixMonthMove;
  const down = t.return6m < -T.sixMonthMove;
  const above = t.vs200d !== null && t.vs200d > 0;
  const below = t.vs200d !== null && t.vs200d < 0;
  const verdict = up && above ? "Rising" : down && below ? "Falling" : "Sideways";
  const level: Level = verdict === "Rising" ? "strong" : verdict === "Sideways" ? "mixed" : "weak";
  const move = t.return6m >= 0 ? `Up ${pct(t.return6m)} over 6 months` : `Down ${pct(t.return6m)} over 6 months`;
  const days = t.dailyBars ? "200 days" : "200 trading days";
  const avg =
    t.vs200d === null
      ? ""
      : t.vs200d >= 0
        ? `, and ${pct(t.vs200d)} above its average price of the last ${days}`
        : `, and ${pct(t.vs200d)} below its average price of the last ${days}`;
  return {
    key: "trend",
    label,
    level,
    rated: true,
    verdict,
    sentence: `${move}${avg}.`,
    inputs: [
      input("6-month price change", t.return6m, pct(t.return6m)),
      input("Price vs 200-day average", t.vs200d, t.vs200d === null ? null : pct(t.vs200d)),
    ],
    sources: t.asOf ? [{ kind: "price_history", label: `Daily closing prices to ${t.asOf}`, ref: t.asOf }] : [],
  };
}

export interface UpcomingEvent {
  type: "earnings" | "ex_dividend" | "dividend_payment";
  date: string;
  source: Source;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Wed 1 Oct". Built by hand, not with toLocaleDateString: Node's and the
 * browser's ICU data format "en-GB" differently ("Wed 1 Oct" vs "Wed, 1 Oct"),
 * which broke hydration, and the summary's number guard compares these
 * strings exactly.
 */
export function plainDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The next-event verdict when Cairn's calendar has nothing for the symbol. */
export const NO_EVENT_VERDICT = "None in calendar";

/** True for a next-event tile that names a dated event (the page highlights it). */
export function hasUpcomingEvent(d: Dimension): boolean {
  return d.key === "next_event" && d.verdict !== NO_EVENT_VERDICT;
}

export function nextEventDimension(today: string, events: UpcomingEvent[], reactions: EarningsReaction[]): Dimension {
  const label = "Next event";
  const T = THRESHOLDS.nextEvent;
  const upcoming = events
    .filter((e) => e.date >= today && daysBetween(today, e.date) <= T.horizonDays)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!upcoming) {
    // A statement about Cairn's calendar, not about the world: the calendar
    // only reaches a few weeks out and its source can fail.
    return {
      key: "next_event",
      label,
      level: "not_applicable",
      rated: false,
      verdict: NO_EVENT_VERDICT,
      sentence: `Cairn's calendar has no earnings or dividend dates for it in the next ${T.calendarLooksAheadDays} days.`,
      inputs: [],
      sources: [],
    };
  }
  const n = daysBetween(today, upcoming.date);
  const when = n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
  const what = upcoming.type === "earnings" ? "Earnings" : upcoming.type === "ex_dividend" ? "Dividend cut-off date" : "Dividend payment";
  const verdict = `${what} ${when}`;
  const inputs = [input("Days until the event", n, String(n)), input("Event date", null, plainDate(upcoming.date))];
  const sources: Source[] = [upcoming.source];
  let sentence = `${what}, ${plainDate(upcoming.date)}.`;
  if (upcoming.type === "ex_dividend") sentence += " Only shares owned before this day get the next dividend.";
  if (upcoming.type === "earnings") {
    const recent = reactions.slice(0, T.maxReactions);
    if (recent.length >= T.minReactions) {
      const big = recent.filter((r) => Math.abs(r.move) >= T.bigMove).length;
      const typical = median(recent.map((r) => Math.abs(r.move)))!;
      sentence += ` On its last ${recent.length} results days the share moved ${pct(T.bigMove)} or more ${big} times; the typical move was ${oneDp(typical * 100)}%.`;
      inputs.push(
        input("Past results days counted", recent.length, String(recent.length)),
        input(`Results days with a move of ${pct(T.bigMove)} or more`, big, String(big)),
        input("Typical results-day move", typical, `${oneDp(typical * 100)}%`),
      );
      sources.push({ kind: "earnings_release", label: `${recent.length} earnings releases (SEC 8-K item 2.02) and closing prices`, ref: `${recent[recent.length - 1].release_date}..${recent[0].release_date}` });
    }
  }
  return { key: "next_event", label, level: "not_applicable", rated: false, verdict, sentence, inputs, sources };
}

// --------------------------------------------------------------- the card

export interface ScorecardInput {
  symbol: string;
  assetType: string | null;
  today: string;
  /** "available" only for equities with stored SEC quarters. */
  companyData: "available" | "not_applicable" | "unavailable";
  metrics: CompanyMetrics | null;
  valuation: ValuationInput;
  dividend: DividendInput;
  trend: TrendInput;
  events: UpcomingEvent[];
  reactions: EarningsReaction[];
  filing: FilingRef | null;
}

const COMPANY_NA = "There is no company behind it, so company figures don't apply.";
const FUND_NA = "A fund holds many companies, so single-company figures don't apply.";

export function buildScorecard(i: ScorecardInput): Scorecard {
  const trend = trendDimension(i.trend);
  const next = nextEventDimension(i.today, i.events, i.reactions);
  let company: Dimension[];
  if (i.companyData === "not_applicable") {
    const why = i.assetType === "etf" ? FUND_NA : COMPANY_NA;
    company = [
      NA("valuation", "Price vs profit", why),
      NA("growth", "Growth", why),
      NA("health", "Financial health", why),
      NA("dividend", "Dividend", why),
    ];
  } else if (i.companyData === "unavailable") {
    const why = "No US company filings are stored for it.";
    company = [
      NA("valuation", "Price vs profit", why, "Not available"),
      NA("growth", "Growth", why, "Not available"),
      NA("health", "Financial health", why, "Not available"),
      NA("dividend", "Dividend", why, "Not available"),
    ];
  } else {
    company = [
      valuationDimension(i.valuation),
      growthDimension(i.metrics, i.filing),
      healthDimension(i.metrics, i.filing),
      dividendDimension(i.dividend),
    ];
  }
  return { symbol: i.symbol, asOf: i.today, dimensions: [...company, trend, next] };
}

/** Bar segments for a level: the length carries the meaning, not just colour. */
export function barSegments(level: Level): 0 | 1 | 2 | 3 {
  return level === "strong" ? 3 : level === "mixed" ? 2 : level === "weak" ? 1 : 0;
}

/** Median of peers' current P/E, positive only; null below the peer minimum. */
export function sectorMedianPe(peerPes: (number | null)[], minPeers: number = THRESHOLDS.valuation.minSectorPeers): { median: number; peers: number } | null {
  const valid = peerPes.filter((p): p is number => p !== null && Number.isFinite(p) && p > 0);
  if (valid.length < minPeers) return null;
  return { median: median(valid)!, peers: valid.length };
}
