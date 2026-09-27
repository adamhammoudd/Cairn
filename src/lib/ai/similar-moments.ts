// Better "similar moments": extra conditions on top of the factor-derived
// cases (lib/ai/factors.ts), each one a fact about the symbol that a reader
// would recognise.
//
//   earnings_window  results due within EARNINGS_WINDOW_SESSIONS sessions
//                    (earnings_releases for the past, the calendar for today)
//   trend_level      the scorecard's own trend verdict: Rising / Sideways /
//                    Falling, same rule and thresholds as trendDimension
//   valuation_level  the scorecard's price-vs-profit verdict: cheaper / usual /
//                    pricier than its own 5-year average P/E
//
// Each condition narrows the case set only if what is left still has
// MIN_FACTOR_ANALOG_SAMPLE cases; otherwise it is skipped and reported as
// such, the same trade of specificity for sample size deriveFactorAnalogs
// makes. Which conditions the engine uses at all was decided by measurement
// (docs/decisions/2026-09-27-analysis-rebuild.md, "Rule for adding a similar
// moment condition"); see ENGINE_CONDITIONS below for the result.
//
// Coins and funds have no company behind them: earnings and valuation are
// "not applicable" for them, never a zero or an empty state.
//
// Pure: no database, no model.

import { MIN_FACTOR_ANALOG_SAMPLE } from "@/lib/ai/factors";
import { THRESHOLDS, VALUATION_VERDICTS } from "@/lib/scorecard";
import { closeOnOrBefore, peHistory, type PricePoint, type Quarter } from "@/lib/fundamentals";

/** Results due within this many sessions after the moment count as "results coming up". */
export const EARNINGS_WINDOW_SESSIONS = 7;

/**
 * Days after a quarter ends before its figures are treated as known. Large
 * US filers must file a 10-Q within 40 days and a 10-K within 60, so 60 keeps
 * a past moment's valuation from using a quarter nobody had seen yet.
 */
export const FILING_LAG_DAYS = 60;

export type ExtraConditionKey = "earnings_window" | "trend_level" | "valuation_level";
export type TrendLevel = "Rising" | "Sideways" | "Falling";
export type ValuationLevel = "cheaper" | "usual" | "pricier";

export const CONDITION_LABELS: Record<ExtraConditionKey, string> = {
  earnings_window: `Results due within ${EARNINGS_WINDOW_SESSIONS} trading days`,
  trend_level: "Same price trend as the scorecard",
  valuation_level: "Same price vs profit as the scorecard",
};

// ----------------------------------------------------------------- earnings

/** Weekdays after `today` up to and including `date`; negative for a past date, 0 for today. */
export function sessionsUntil(today: string, date: string): number {
  if (date === today) return 0;
  const [from, to, sign] = date > today ? [today, date, 1] : [date, today, -1];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let n = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n * sign;
}

/** True when a results date falls after the moment's session and within `sessions` sessions of it. */
export function earningsWithinSessions(bars: { date: string }[], index: number, releaseDates: string[], sessions: number): boolean {
  const start = bars[index]?.date;
  const end = bars[Math.min(index + sessions, bars.length - 1)]?.date;
  if (!start || !end) return false;
  return releaseDates.some((r) => r > start && r <= end);
}

// -------------------------------------------------------------------- trend

/**
 * The scorecard's trend verdict for every bar: 6-month move beyond
 * THRESHOLDS.trend.sixMonthMove plus price vs its 200-bar average (same rule as
 * trendDimension, same half-year lookback as trendInputsFromFactorSet). Null
 * where there are too few bars for either.
 */
export function trendLevelSeries(closes: number[], periodsPerYear: number): (TrendLevel | null)[] {
  const lookback = Math.round(periodsPerYear / 2);
  const T = THRESHOLDS.trend.sixMonthMove;
  const out: (TrendLevel | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= 200) sum -= closes[i - 200];
    if (i < 199 || i < lookback || closes[i - lookback] <= 0) continue;
    const sma200 = sum / 200;
    const r = closes[i] / closes[i - lookback] - 1;
    const vs = closes[i] / sma200 - 1;
    out[i] = r > T && vs > 0 ? "Rising" : r < -T && vs < 0 ? "Falling" : "Sideways";
  }
  return out;
}

// ---------------------------------------------------------------- valuation

/**
 * Price vs profit at a past date, judged the way the scorecard judges today:
 * P/E on that date against the average of its quarter-end P/Es, using only
 * quarters that had been filed by then (FILING_LAG_DAYS). Null when there is
 * no profit, too little filing history, or no price - never a zero.
 */
export function valuationLevelAt(date: string, quarters: Quarter[], pricesAsc: PricePoint[], annualEps: Map<number, number> | undefined): ValuationLevel | null {
  const cutoff = new Date(Date.parse(`${date}T00:00:00Z`) - FILING_LAG_DAYS * 86_400_000).toISOString().slice(0, 10);
  const known = quarters.filter((q) => q.period_end <= cutoff);
  if (known.length < 4) return null;
  const close = closeOnOrBefore(pricesAsc, date);
  if (!close) return null;
  const pe = peHistory(known, pricesAsc.filter((p) => p.date <= date), close.close, annualEps);
  if (!pe.current || !pe.fiveYearAverage) return null;
  const ratio = pe.current.pe / pe.fiveYearAverage;
  const T = THRESHOLDS.valuation;
  return ratio <= T.cheapRatio ? "cheaper" : ratio >= T.expensiveRatio ? "pricier" : "usual";
}

/** The scorecard's valuation verdict as a level; null for the no-profit (cash-yield) verdicts. */
export function valuationLevelFromVerdict(verdict: string | null | undefined): ValuationLevel | null {
  if (verdict === VALUATION_VERDICTS.cheaper) return "cheaper";
  if (verdict === VALUATION_VERDICTS.usual) return "usual";
  if (verdict === VALUATION_VERDICTS.pricier) return "pricier";
  return null;
}

// ---------------------------------------------------------------- today

export interface TodayState {
  applies: boolean;
  today: string | null;
}

export function todayConditionStates(i: {
  assetType: string | null;
  today: string;
  /** Upcoming results dates from the calendar (announced or estimated). */
  upcomingEarnings: string[];
  trendLevel: TrendLevel | null;
  valuationVerdict: string | null;
}): Record<ExtraConditionKey, TodayState> {
  // A company is behind the price only for a share. Coins and funds get no
  // company conditions at all.
  const company = i.assetType === "equity";
  const soon = i.upcomingEarnings.some((d) => {
    const s = sessionsUntil(i.today, d);
    return s >= 1 && s <= EARNINGS_WINDOW_SESSIONS;
  });
  return {
    earnings_window: { applies: company, today: company ? (soon ? "within" : "not_within") : null },
    trend_level: { applies: true, today: i.trendLevel },
    valuation_level: { applies: company, today: company ? valuationLevelFromVerdict(i.valuationVerdict) : null },
  };
}

// ------------------------------------------------------------------ apply

export interface ConditionSpec<C> {
  key: ExtraConditionKey;
  label: string;
  /** False for a condition that does not apply to this asset (a coin's earnings). */
  applies?: boolean;
  today: string | null;
  stateOf: (c: C) => string | null;
}

export interface ConditionReport {
  key: ExtraConditionKey;
  label: string;
  today: string | null;
  kept: boolean;
  reason: "applied" | "too_few" | "no_state_today" | "not_applicable";
  nBefore: number;
  nAfter: number;
}

/**
 * Narrow `cases` by each condition in turn, keeping one only if at least
 * `min` cases remain. The order is fixed by the caller, never chosen by which
 * result looks best.
 */
export function applyConditions<C>(cases: C[], specs: ConditionSpec<C>[], min: number = MIN_FACTOR_ANALOG_SAMPLE): { cases: C[]; report: ConditionReport[] } {
  let current = cases;
  const report: ConditionReport[] = [];
  for (const s of specs) {
    const row = { key: s.key, label: s.label, today: s.today, nBefore: current.length };
    if (s.applies === false) {
      report.push({ ...row, kept: false, reason: "not_applicable", nAfter: current.length });
      continue;
    }
    if (s.today === null) {
      report.push({ ...row, kept: false, reason: "no_state_today", nAfter: current.length });
      continue;
    }
    const narrowed = current.filter((c) => s.stateOf(c) === s.today);
    if (narrowed.length < min) {
      report.push({ ...row, kept: false, reason: "too_few", nAfter: narrowed.length });
      continue;
    }
    report.push({ ...row, kept: true, reason: "applied", nAfter: narrowed.length });
    current = narrowed;
  }
  return { cases: current, report };
}

// ------------------------------------------------------ earnings fallback

/**
 * "Results are due in k sessions": every past results release measured from
 * the same point before it - the close k sessions before the release session,
 * then `horizon` sessions on. Used only when today's factor state matched too
 * few past moments (lib/ai/similar-moments-data.ts) and results fall inside
 * the horizon; always labelled as past results, never as similar moments.
 *
 * `bars` oldest first. A release whose window runs off either end of the
 * stored history is skipped, never shortened. Windows never overlap.
 */
export function earningsWindows(
  bars: { date: string; close: number }[],
  releaseDates: string[],
  sessionsToRelease: number,
  horizon: number,
): { index: number; date: string; dateAfter: string; priceBefore: number; priceAfter: number; movePct: number; releaseDate: string }[] {
  const out: ReturnType<typeof earningsWindows> = [];
  let nextAllowed = 0;
  for (const release of [...new Set(releaseDates)].sort()) {
    // The release session: the first stored session on or after the release date.
    const r = bars.findIndex((b) => b.date >= release);
    if (r < 0) continue;
    const start = r - sessionsToRelease;
    const end = start + horizon;
    if (start < 0 || end >= bars.length || start < nextAllowed) continue;
    const before = bars[start].close;
    const after = bars[end].close;
    if (!(before > 0) || !Number.isFinite(after)) continue;
    out.push({ index: start, date: bars[start].date, dateAfter: bars[end].date, priceBefore: before, priceAfter: after, movePct: ((after - before) / before) * 100, releaseDate: release });
    nextAllowed = end;
  }
  return out;
}
