// Direction, not magnitude: what the similar moments in a symbol's own price
// history did next.
//
// The headline used to be "chance of a >=5% move in either direction within
// 10 sessions", which told an everyday investor neither which way nor how far.
// This module keeps the same cases (factor-derived analogs, each measured
// FACTOR_FORWARD_SESSIONS ahead, lib/ai/factors.ts) and the same statistics
// (Wilson interval and confidence rule, lib/ai/analytics.ts), but points them
// at the question a reader asks:
//
//   * direction - how many ended higher, and a Wilson interval on that up-rate;
//   * typical outcome - the 25th / 50th / 75th percentile of the SIGNED moves,
//     plus the worst and best case seen;
//   * the >=5% move band, still computed, kept as a trader figure only.
//
// Pure: no database, no model. Every figure is arithmetic on the cases passed
// in, so it can be re-derived and audited, and it is what the model's words
// are later checked against.
//
// Derived volatility-regime rows (docs/decisions/2026-08-20-volatility-regime-
// as-analog.md, Option B) are not passed in: callers give this module only
// factor-derived cases, so the headline count never includes them.

import {
  computeProbabilityBand,
  ELEVATED_MOVE_THRESHOLD_PCT,
  gradeConfidence,
  wilsonInterval,
  type Confidence,
  type ProbabilityBand,
} from "@/lib/ai/analytics";
import { MIN_FACTOR_ANALOG_SAMPLE, quantile } from "@/lib/ai/factors";

export interface MoveCase {
  date: string;
  dateAfter?: string | null;
  priceBefore: number;
  priceAfter: number;
}

export interface DirectionCase {
  date: string;
  dateAfter: string | null;
  /** Signed move over the horizon, percent, one decimal. */
  movePct: number;
}

export interface DirectionalHistory {
  status: "ok" | "too_few";
  horizonSessions: number;
  n: number;
  higher: number;
  /** Lower or unchanged: a flat case is never counted as higher. */
  lower: number;
  /** The share that ended higher and its 95% Wilson interval, whole percent. Null with no cases. */
  upRate: { point: number | null; low: number | null; high: number | null };
  confidence: Confidence;
  /** Signed percent, one decimal. Null under MIN_FACTOR_ANALOG_SAMPLE: a range from three cases is not "typical". */
  typical: { p25: number; median: number; p75: number } | null;
  worst: number | null;
  best: number | null;
  /** Every case, oldest first. Premium detail: the server strips it for Free. */
  cases: DirectionCase[];
  /** Secondary figures for finance-savvy readers, never the headline. */
  trader: { thresholdPct: number; moveBand: ProbabilityBand };
}

/** One decimal, rounded half away from zero so -1.75 and 1.75 mirror each other. */
function round1(v: number): number {
  const r = Math.round(Math.abs(v) * 10 + 1e-9) / 10;
  return v < 0 && r !== 0 ? -r : r;
}

/** A percentile (linear interpolation, the engine's `quantile`) of signed moves, one decimal. */
export function signedPercentile(moves: number[], q: number): number | null {
  const v = quantile(moves, q);
  return v === null ? null : round1(v);
}

export function directionalHistory(input: MoveCase[], horizonSessions: number): DirectionalHistory {
  const valid = input
    .filter((c) => c.priceBefore > 0 && Number.isFinite(c.priceAfter))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cases: DirectionCase[] = valid.map((c) => ({
    date: c.date,
    dateAfter: c.dateAfter ?? null,
    movePct: round1(((c.priceAfter - c.priceBefore) / c.priceBefore) * 100),
  }));
  const n = cases.length;
  // Counted on prices, not on the rounded move, so a +0.04% case is higher.
  const higher = valid.filter((c) => c.priceAfter > c.priceBefore).length;
  const moveBand = computeProbabilityBand(
    valid.map((c, i) => ({ id: String(i), event_type: "factor_signal", event_date: c.date, price_before: c.priceBefore, price_after: c.priceAfter })),
  );
  const trader = { thresholdPct: ELEVATED_MOVE_THRESHOLD_PCT, moveBand };

  if (n === 0) {
    return { status: "too_few", horizonSessions, n, higher: 0, lower: 0, upRate: { point: null, low: null, high: null }, confidence: "low", typical: null, worst: null, best: null, cases, trader };
  }

  const { low, high } = wilsonInterval(higher, n);
  const upRate = { point: Math.round((higher / n) * 100), low: Math.round(low * 100), high: Math.round(high * 100) };
  const base = { horizonSessions, n, higher, lower: n - higher, upRate, confidence: gradeConfidence(n, low, high), cases, trader };

  if (n < MIN_FACTOR_ANALOG_SAMPLE) {
    return { ...base, status: "too_few", confidence: "low", typical: null, worst: null, best: null };
  }

  const moves = valid.map((c) => ((c.priceAfter - c.priceBefore) / c.priceBefore) * 100);
  return {
    ...base,
    status: "ok",
    typical: { p25: signedPercentile(moves, 0.25)!, median: signedPercentile(moves, 0.5)!, p75: signedPercentile(moves, 0.75)! },
    worst: round1(Math.min(...moves)),
    best: round1(Math.max(...moves)),
  };
}
