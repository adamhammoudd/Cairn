// "Too new to compare with its own past" - the plain answer for a symbol whose
// stored price history is genuinely too short for the analog scan, instead of
// the generic thin-data panel.
//
// The threshold is the engine's own MIN_FACTOR_HISTORY_BARS (252), unchanged:
// this module only changes what the reader is TOLD when that bar isn't met. It
// never lowers it, and it never presents anything as the symbol's own history.
//
// The optional comparison line is a base rate for the symbol's benchmark (SPY
// for shares, BTC for coins - the same benchmarkSymbolFor the factor scan
// uses), computed with scanWindows, the same no-condition windows the
// "nothing is unusual today" baseline uses. It is always labelled as the
// benchmark's record, never the symbol's.

import {
  benchmarkSymbolFor,
  computeFactorSet,
  scanWindows,
  FACTOR_FORWARD_SESSIONS,
  MIN_FACTOR_HISTORY_BARS,
  type FactorBar,
} from "@/lib/ai/factors";
import { directionalHistory } from "@/lib/ai/direction";
import { horizonWords } from "@/lib/ai/history-plain";

export interface YoungHistory {
  /** "BLORB has only 4 days of price history, too new to compare with its own past." */
  message: string;
  /** A labelled benchmark base rate, or null when none can be computed honestly. */
  comparison: string | null;
  bars: number;
  benchmark: string | null;
}

/** Plain names for the two benchmarks, so the line never reads as a bare ticker. */
const BENCHMARK_NAMES: Record<string, string> = {
  SPY: "the S&P 500 (SPY)",
  BTC: "Bitcoin (BTC)",
};

export function isTooYoung(bars: number): boolean {
  return bars < MIN_FACTOR_HISTORY_BARS;
}

/** Coins trade every day; shares trade on weekdays - count in the unit the reader would. */
export function historyLengthWords(bars: number, assetType: string | null): string {
  const unit = assetType === "crypto" ? "day" : "trading day";
  return `${bars} ${unit}${bars === 1 ? "" : "s"}`;
}

export function youngHistoryMessage(symbol: string, bars: number, assetType: string | null): string {
  if (bars === 0) return `${symbol} has no stored price history yet, so there is nothing to compare with its own past.`;
  return `${symbol} has only ${historyLengthWords(bars, assetType)} of price history, too new to compare with its own past.`;
}

/** "two weeks" -> "two-week", "10 days" -> "10-day". */
function stretchWords(when: string): string {
  return when.replace(/ weeks?$/, "-week").replace(/ days?$/, "-day").replace(/ trading-day$/, "-trading-day");
}

/**
 * "For comparison, across every two-week stretch of the S&P 500 (SPY) since
 * 2018, it ended higher in 118 of 200. That is the market's record, not
 * BLORB's." - or null when the benchmark itself is too thin to say.
 */
export function benchmarkComparison(
  symbol: string,
  assetType: string | null,
  benchmarkBars: FactorBar[],
): { line: string; benchmark: string } | null {
  const benchmark = benchmarkSymbolFor(symbol, assetType);
  if (!benchmark || benchmarkBars.length < MIN_FACTOR_HISTORY_BARS) return null;
  const set = computeFactorSet({ symbol: benchmark, assetType: assetType === "crypto" ? "crypto" : "etf", bars: benchmarkBars, benchmark: null });
  if (!set) return null;
  const windows = scanWindows(set, FACTOR_FORWARD_SESSIONS);
  const history = directionalHistory(
    windows.map((w) => ({ date: w.date, dateAfter: w.dateAfter, priceBefore: w.priceBefore, priceAfter: w.priceAfter })),
    FACTOR_FORWARD_SESSIONS,
  );
  if (history.status !== "ok") return null;
  const name = BENCHMARK_NAMES[benchmark] ?? benchmark;
  const since = benchmarkBars[0].date.slice(0, 4);
  const when = horizonWords(FACTOR_FORWARD_SESSIONS, assetType === "crypto" ? "crypto" : "equity");
  const kind = assetType === "crypto" ? "the wider crypto market's" : "the market's";
  return {
    benchmark,
    line:
      `For comparison, across every ${stretchWords(when)} stretch of ${name} since ${since}, ` +
      `it ended higher in ${history.higher} of ${history.n}. That is ${kind} record, not ${symbol}'s.`,
  };
}

export function youngHistory(symbol: string, bars: number, assetType: string | null, benchmarkBars: FactorBar[]): YoungHistory {
  const comparison = benchmarkComparison(symbol, assetType, benchmarkBars);
  return {
    message: youngHistoryMessage(symbol, bars, assetType),
    comparison: comparison?.line ?? null,
    bars,
    benchmark: comparison?.benchmark ?? null,
  };
}
