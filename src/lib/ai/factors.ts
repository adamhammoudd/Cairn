// Asset-agnostic factor readings and self-referential analog derivation.
//
// The curated `historical_events` table only ever covers symbols the daily
// Edge Function iterates, so a ticker nobody had asked about had no analogs and
// generation failed with "not enough data". Everything here works from one
// input every ingested symbol already has - its own daily OHLCV history - so a
// brand-new ticker gets a real, replicable analog set:
//
//   1. compute a fixed set of deterministic factors from the price series;
//   2. describe the state each factor is in TODAY (overbought, deep drawdown...);
//   3. scan the symbol's own past for days when that same state held, and
//      measure what happened over the next FACTOR_FORWARD_SESSIONS sessions.
//
// Those "instances" are then scored by the same Wilson-interval machinery in
// lib/ai/analytics.ts as every other analog. No model is involved; every number
// is arithmetic on stored prices, so it can be re-derived and audited.
//
// Pure module: no database, no network, no server-only imports - the loaders
// and persistence live in lib/ai/factor-analysis.ts.
//
// Known limitations, stated rather than hidden:
//   * Percentile-based states (momentum, drawdown, relative strength) use
//     quantiles of the symbol's full available history as their thresholds, so
//     the state boundary itself has mild look-ahead. The OUTCOME (the forward
//     move) never does: instances only use prices strictly before their entry.
//   * Relative strength compares against SPY (BTC for crypto) only. The curated
//     SECTORS map covers six symbols and names no sector ETF, so no sector
//     benchmark is fabricated.
//   * Overlapping windows are removed (see deriveFactorAnalogs), but instances
//     from one bull run are still serially correlated; the Wilson interval
//     assumes independence, so treat narrow intervals with some scepticism.

import {
  rollingVolatility,
  CRYPTO_PERIODS_PER_YEAR,
  EQUITY_PERIODS_PER_YEAR,
} from "../../../supabase/functions/_shared/volatility";

/** Sessions forward over which a signal's outcome is measured. */
export const FACTOR_FORWARD_SESSIONS = 10;

/**
 * The floor: the fewest factor-derived instances we will treat as an analog
 * set at all. It matches the n<5 "low confidence" line in computeProbabilityBand.
 * Below it a cold ticker fails with a "not enough history yet" message instead
 * of producing a number; a ticker that also has curated analogs simply falls
 * back to those.
 */
export const MIN_FACTOR_ANALOG_SAMPLE = 5;

/** Sample size at which computeProbabilityBand can grade an interval "high". */
export const TARGET_FACTOR_ANALOG_SAMPLE = 15;

/** Bars needed before the 200-day SMA and 1-year drawdown mean anything. */
export const MIN_FACTOR_HISTORY_BARS = 252;

/**
 * History the analog scan wants, as opposed to the bare minimum it tolerates.
 *
 * MIN_FACTOR_HISTORY_BARS only guarantees the factors can be COMPUTED. Getting
 * a usable analog SET needs materially more, because the percentile-based
 * states cluster: over ~2 years a deep drawdown is one episode, and the
 * non-overlap rule correctly reduces that episode to two or three instances.
 * Measured over the live directory, ~2 years of history produced a usable set
 * for fewer than half of the symbols that had no curated events.
 *
 * ~4 years of equity sessions. Callers pass it to ensureSymbolIngested as
 * `minBars` so a symbol held only at the default range is deepened before it
 * is analysed.
 */
export const TARGET_FACTOR_HISTORY_BARS = 1000;

/**
 * Provider range that supplies TARGET_FACTOR_HISTORY_BARS. Kept beside it so
 * the methodology's data requirement and the fetch that satisfies it cannot
 * drift apart; it is just a string here, the fetching lives in market-data.
 */
export const FACTOR_HISTORY_RANGE = "5y";

/** Most conditions combined into one signal. More would starve the sample. */
const MAX_CONDITIONS = 3;

/**
 * A state that describes most of a symbol's history is not a signal - matching
 * on it just returns "most days", i.e. the unconditional base rate dressed up
 * as an analog set (a flat series is "at its 1-year high" every single day).
 * States more common than this are never used as conditions.
 */
const MAX_CONDITION_FREQUENCY = 0.5;

const MIN_ANNUALIZED_VOL = 0.15; // mirrors deriveVolatilityRegimes' absolute floor
const VOL_WINDOW = 30;

export interface FactorBar {
  date: string;
  close: number;
  volume: number | null;
}

export interface FactorInput {
  symbol: string;
  assetType: string | null;
  bars: FactorBar[];
  benchmark?: { symbol: string; bars: FactorBar[] } | null;
}

export type FactorKey =
  | "trend"
  | "rsi14"
  | "momentum_3m"
  | "volatility"
  | "drawdown"
  | "volume"
  | "mean_reversion"
  | "relative_strength";

export interface FactorReading {
  key: FactorKey;
  label: string;
  /** Current numeric reading, null when it cannot be computed for this symbol. */
  value: number | null;
  /** Where the current value sits in the symbol's own history, 0-100. */
  percentile: number | null;
  /** The categorical state used for analog matching, null when neutral/unavailable. */
  state: string | null;
  /** Plain-language description of the state, code-generated. */
  stateLabel: string | null;
  detail: Record<string, unknown>;
}

interface FactorSeries {
  values: (number | null)[];
  states: (string | null)[];
}

export interface FactorSet {
  symbol: string;
  asOf: string;
  barCount: number;
  periodsPerYear: number;
  readings: FactorReading[];
  series: Record<FactorKey, FactorSeries>;
  bars: FactorBar[];
}

// ------------------------------------------------------------------ helpers
type Nullable = number | null;

function rollingMean(values: number[], window: number): Nullable[] {
  const out: Nullable[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

function rollingStd(values: number[], window: number): Nullable[] {
  const means = rollingMean(values, window);
  return values.map((_, i) => {
    const m = means[i];
    if (m === null) return null;
    let ss = 0;
    for (let j = i - window + 1; j <= i; j++) ss += (values[j] - m) ** 2;
    return Math.sqrt(ss / window);
  });
}

function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Wilder's RSI. */
export function rsiSeries(closes: number[], period = 14): Nullable[] {
  const out: Nullable[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = toRsi(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

function rocSeries(closes: number[], n: number): Nullable[] {
  return closes.map((c, i) => (i < n || closes[i - n] === 0 ? null : (c / closes[i - n] - 1) * 100));
}

function nonNull(values: Nullable[]): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

/** Linear-interpolated quantile of the non-null values, q in [0,1]. */
export function quantile(values: Nullable[], q: number): number | null {
  const sorted = nonNull(values).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Share (0-100) of the symbol's own non-null history at or below `value`. */
export function percentileRank(values: Nullable[], value: number): number | null {
  const all = nonNull(values);
  if (all.length === 0) return null;
  return Math.round((all.filter((v) => v <= value).length / all.length) * 1000) / 10;
}

const round = (v: number | null, dp = 2): number | null => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

// -------------------------------------------------------------- state labels
const STATE_LABELS: Record<string, string> = {
  "trend:uptrend": "price above its 50-day SMA, which is above its 200-day SMA (established uptrend)",
  "trend:downtrend": "price below its 50-day SMA, which is below its 200-day SMA (established downtrend)",
  "rsi14:overbought": "RSI-14 at or above 70 (overbought)",
  "rsi14:oversold": "RSI-14 at or below 30 (oversold)",
  "momentum_3m:strong": "3-month rate of change in the top decile of its own history",
  "momentum_3m:weak": "3-month rate of change in the bottom decile of its own history",
  "volatility:elevated": "30-day realized volatility above 1.5x its own median (and above the 15% floor)",
  "drawdown:deep": "drawdown from its 1-year high deeper than in 90% of its own history",
  "drawdown:at_high": "at a new trailing 1-year high",
  "volume:spike": "volume at least 2 standard deviations above its trailing 20-day average",
  "mean_reversion:stretched_high": "price at least 1.5 standard deviations above its 20-day mean",
  "mean_reversion:stretched_low": "price at least 1.5 standard deviations below its 20-day mean",
  "relative_strength:leader": "63-day return versus its benchmark in the top decile of its own history",
  "relative_strength:laggard": "63-day return versus its benchmark in the bottom decile of its own history",
};

export function stateLabel(key: FactorKey, state: string): string {
  return STATE_LABELS[`${key}:${state}`] ?? `${key} ${state}`;
}

// ---------------------------------------------------------------- the factors
export function benchmarkSymbolFor(symbol: string, assetType: string | null): string | null {
  const benchmark = assetType === "crypto" ? "BTC" : "SPY";
  return benchmark === symbol ? null : benchmark;
}

/** Days a benchmark close may be carried forward before it is too stale to compare against. */
const MAX_BENCHMARK_STALENESS_DAYS = 7;

const daysBetween = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

function relativeReturn(bars: FactorBar[], benchmark: FactorInput["benchmark"], lookback: number): Nullable[] {
  if (!benchmark) return bars.map(() => null);

  // As-of lookup: the most recent benchmark close ON OR BEFORE each of the
  // symbol's dates, rather than requiring an exact date match.
  //
  // An exact match silently produced null whenever the two calendars differed
  // by even a day - including the ordinary case of the benchmark not having
  // refreshed yet today, which killed the reading for the CURRENT bar and so
  // for the state that matters. Walking on-or-before is strictly
  // backward-looking, so it still cannot leak a future price.
  //
  // A close is only carried forward for MAX_BENCHMARK_STALENESS_DAYS: past
  // that the benchmark is not being updated, and a flat carried-forward series
  // would read as "the benchmark did nothing", inventing relative strength
  // where there is simply no data.
  const asOf: Nullable[] = new Array(bars.length).fill(null);
  let j = 0;
  let last: FactorBar | null = null;
  for (let i = 0; i < bars.length; i++) {
    while (j < benchmark.bars.length && benchmark.bars[j].date <= bars[i].date) last = benchmark.bars[j++];
    asOf[i] = last && daysBetween(last.date, bars[i].date) <= MAX_BENCHMARK_STALENESS_DAYS ? last.close : null;
  }

  return bars.map((b, i) => {
    if (i < lookback) return null;
    const past = bars[i - lookback];
    const benchNow = asOf[i];
    const benchPast = asOf[i - lookback];
    if (!benchNow || !benchPast || past.close === 0) return null;
    return (b.close / past.close - 1) * 100 - (benchNow / benchPast - 1) * 100;
  });
}

/**
 * Compute every factor over the whole history (not just today), so the same
 * series that produces today's reading also drives the analog scan. Returns
 * null when the history is too short for the factors to mean anything.
 */
export function computeFactorSet(input: FactorInput): FactorSet | null {
  const { bars } = input;
  if (bars.length < MIN_FACTOR_HISTORY_BARS) return null;

  const n = bars.length;
  const last = n - 1;
  const closes = bars.map((b) => b.close);
  const periodsPerYear = input.assetType === "crypto" ? CRYPTO_PERIODS_PER_YEAR : EQUITY_PERIODS_PER_YEAR;

  // Trend: close vs 50/200-day SMA.
  const sma50 = rollingMean(closes, 50);
  const sma200 = rollingMean(closes, 200);
  const pctVsSma50 = closes.map((c, i) => (sma50[i] === null ? null : (c / (sma50[i] as number) - 1) * 100));
  const trendStates = closes.map((c, i) => {
    const s50 = sma50[i];
    const s200 = sma200[i];
    if (s50 === null || s200 === null) return null;
    if (c > s50 && s50 > s200) return "uptrend";
    if (c < s50 && s50 < s200) return "downtrend";
    return null;
  });

  // Momentum: RSI-14 and 1/3/6-month rate of change.
  const rsi = rsiSeries(closes, 14);
  const roc21 = rocSeries(closes, 21);
  const roc63 = rocSeries(closes, 63);
  const roc126 = rocSeries(closes, 126);
  const rsiStates = rsi.map((v) => (v === null ? null : v >= 70 ? "overbought" : v <= 30 ? "oversold" : null));
  const rocHigh = quantile(roc63, 0.9);
  const rocLow = quantile(roc63, 0.1);
  const momentumStates = roc63.map((v) =>
    v === null || rocHigh === null || rocLow === null ? null : v >= rocHigh ? "strong" : v <= rocLow ? "weak" : null,
  );

  // Realized volatility regime - same rolling vol and relative-plus-floor rule
  // as deriveVolatilityRegimes, evaluated per day instead of per regime.
  const vols = rollingVolatility(closes, VOL_WINDOW, periodsPerYear);
  const observedVols = nonNull(vols).sort((a, b) => a - b);
  const volMedian = observedVols.length >= VOL_WINDOW ? observedVols[Math.floor(observedVols.length / 2)] : null;
  const volThreshold = volMedian === null ? null : Math.max(volMedian * 1.5, MIN_ANNUALIZED_VOL);
  const volStates = vols.map((v) => (v === null || volThreshold === null ? null : v > volThreshold ? "elevated" : null));

  // Drawdown from the trailing 1-year high, judged against the symbol's own history.
  const DD_WINDOW = 252;
  const DD_MIN = 126;
  const drawdown: Nullable[] = closes.map((c, i) => {
    if (i < DD_MIN) return null;
    let high = -Infinity;
    for (let j = Math.max(0, i - DD_WINDOW + 1); j <= i; j++) high = Math.max(high, closes[j]);
    return high === 0 ? null : (c / high - 1) * 100;
  });
  const ddDeep = quantile(drawdown, 0.1);
  const ddStates = drawdown.map((v) =>
    v === null ? null : v === 0 ? "at_high" : ddDeep !== null && v <= ddDeep ? "deep" : null,
  );

  // Volume anomaly: z-score against the PRIOR 20 / 60 sessions.
  const volumeZ = (window: number): Nullable[] =>
    bars.map((b, i) => {
      if (b.volume === null || b.volume <= 0 || i < window) return null;
      const prior = bars.slice(i - window, i).map((x) => x.volume);
      if (prior.some((v) => v === null || v <= 0)) return null;
      const p = prior as number[];
      const mean = p.reduce((a, c) => a + c, 0) / window;
      const std = Math.sqrt(p.reduce((a, c) => a + (c - mean) ** 2, 0) / window);
      return std === 0 ? null : (b.volume - mean) / std;
    });
  const vz20 = volumeZ(20);
  const vz60 = volumeZ(60);
  const volumeStates = vz20.map((v) => (v === null ? null : v >= 2 ? "spike" : null));

  // Mean reversion: z-score against the 20-day mean (Bollinger-style position).
  const sma20 = rollingMean(closes, 20);
  const std20 = rollingStd(closes, 20);
  const mrZ: Nullable[] = closes.map((c, i) =>
    sma20[i] === null || !std20[i] ? null : (c - (sma20[i] as number)) / (std20[i] as number),
  );
  const mrStates = mrZ.map((v) => (v === null ? null : v >= 1.5 ? "stretched_high" : v <= -1.5 ? "stretched_low" : null));

  // Relative strength versus the benchmark over 63 sessions.
  const rel = relativeReturn(bars, input.benchmark, 63);
  const relHigh = quantile(rel, 0.9);
  const relLow = quantile(rel, 0.1);
  const relStates = rel.map((v) =>
    v === null || relHigh === null || relLow === null ? null : v >= relHigh ? "leader" : v <= relLow ? "laggard" : null,
  );

  const series: Record<FactorKey, FactorSeries> = {
    trend: { values: pctVsSma50, states: trendStates },
    rsi14: { values: rsi, states: rsiStates },
    momentum_3m: { values: roc63, states: momentumStates },
    volatility: { values: vols, states: volStates },
    drawdown: { values: drawdown, states: ddStates },
    volume: { values: vz20, states: volumeStates },
    mean_reversion: { values: mrZ, states: mrStates },
    relative_strength: { values: rel, states: relStates },
  };

  const reading = (
    key: FactorKey,
    label: string,
    detail: Record<string, unknown>,
    percentile = true,
  ): FactorReading => {
    const value = series[key].values[last];
    const state = series[key].states[last];
    return {
      key,
      label,
      value: round(value),
      percentile: percentile && value !== null ? percentileRank(series[key].values, value) : null,
      state,
      stateLabel: state ? stateLabel(key, state) : null,
      detail,
    };
  };

  const s50 = sma50[last];
  const s200 = sma200[last];
  const readings: FactorReading[] = [
    reading("trend", "Trend positioning (% vs 50-day SMA)", {
      sma50: round(s50),
      sma200: round(s200),
      pct_vs_sma200: s200 === null ? null : round((closes[last] / s200 - 1) * 100),
      cross: s50 === null || s200 === null ? null : s50 > s200 ? "golden" : "death",
    }),
    reading("rsi14", "RSI-14", {}),
    reading("momentum_3m", "Momentum (63-session rate of change, %)", {
      roc_1m_pct: round(roc21[last]),
      roc_3m_pct: round(roc63[last]),
      roc_6m_pct: round(roc126[last]),
    }),
    reading("volatility", "30-day realized volatility (annualized)", {
      median: round(volMedian, 4),
      elevated_threshold: round(volThreshold, 4),
      ratio_to_median: vols[last] === null || !volMedian ? null : round((vols[last] as number) / volMedian),
    }),
    reading("drawdown", "Drawdown from trailing 1-year high (%)", {}),
    reading("volume", "Volume z-score vs prior 20 sessions", { z_60_session: round(vz60[last]) }),
    reading("mean_reversion", "Price z-score vs 20-day mean", {}),
    reading(
      "relative_strength",
      `63-session return vs ${input.benchmark?.symbol ?? "benchmark"} (% points)`,
      { benchmark: input.benchmark?.symbol ?? null },
    ),
  ];

  return { symbol: input.symbol, asOf: bars[last].date, barCount: n, periodsPerYear, readings, series, bars };
}

// ------------------------------------------------------------- analog scan
export interface FactorInstance {
  index: number;
  date: string;
  dateAfter: string;
  priceBefore: number;
  priceAfter: number;
  movePct: number;
}

export interface FactorCondition {
  key: FactorKey;
  state: string;
  label: string;
  /** Share of the symbol's own scannable days on which this state held. */
  frequency: number;
}

export interface FactorAnalogSet {
  conditions: FactorCondition[];
  /** Conditions active today that were dropped to reach an adequate sample. */
  droppedConditions: FactorCondition[];
  instances: FactorInstance[];
  horizonSessions: number;
}

export type FactorAnalogResult =
  | { ok: true; analogs: FactorAnalogSet }
  | { ok: false; reason: "no_active_conditions" | "insufficient_instances"; bestSampleSize: number; conditions: FactorCondition[] };

function scan(set: FactorSet, conditions: FactorCondition[], horizon: number): FactorInstance[] {
  const { bars } = set;
  const lastEntry = bars.length - 1 - horizon; // forward window must be complete
  const instances: FactorInstance[] = [];
  let nextAllowed = 0;
  for (let t = 0; t <= lastEntry; t++) {
    if (t < nextAllowed) continue;
    if (!conditions.every((c) => set.series[c.key].states[t] === c.state)) continue;
    const before = bars[t].close;
    const after = bars[t + horizon].close;
    if (!before) continue;
    instances.push({
      index: t,
      date: bars[t].date,
      dateAfter: bars[t + horizon].date,
      priceBefore: before,
      priceAfter: after,
      movePct: ((after - before) / before) * 100,
    });
    // Skip the rest of this forward window so instances never overlap - one
    // long overbought stretch is one observation, not twenty.
    nextAllowed = t + horizon;
  }
  return instances;
}

/**
 * Every non-overlapping `horizon`-session stretch in the symbol's history,
 * with no condition at all: its base rate. Used only when nothing about today
 * is unusual (deriveFactorAnalogs found no active condition), and always
 * labelled as the base rate, never as "similar moments"
 * (docs/decisions/2026-09-27-analysis-rebuild.md, decision 4).
 */
export function scanWindows(set: FactorSet, horizon: number = FACTOR_FORWARD_SESSIONS): FactorInstance[] {
  return scan(set, [], horizon);
}

/**
 * Find every past day the symbol was in the same state as today and measure
 * what followed.
 *
 * "Same state" is the conjunction of up to MAX_CONDITIONS of today's active
 * factor states, rarest first (the rarer a state, the more it says). If the
 * full conjunction is too rare to give TARGET_FACTOR_ANALOG_SAMPLE instances,
 * the least-informative condition is dropped and the scan repeated; this
 * trades specificity for sample size in a fixed, documented order rather than
 * cherry-picking whichever combination looks best.
 */
export function deriveFactorAnalogs(set: FactorSet, horizon: number = FACTOR_FORWARD_SESSIONS): FactorAnalogResult {
  const last = set.bars.length - 1;

  const active: FactorCondition[] = [];
  for (const r of set.readings) {
    if (!r.state) continue;
    const s = set.series[r.key];
    const scannable = s.values.filter((v) => v !== null).length;
    const matching = s.states.filter((st) => st === r.state).length;
    if (scannable === 0 || last < 0) continue;
    const frequency = matching / scannable;
    if (frequency > MAX_CONDITION_FREQUENCY) continue;
    active.push({ key: r.key, state: r.state, label: stateLabel(r.key, r.state), frequency });
  }
  if (active.length === 0) {
    return { ok: false, reason: "no_active_conditions", bestSampleSize: 0, conditions: [] };
  }

  active.sort((a, b) => a.frequency - b.frequency || a.key.localeCompare(b.key));
  const top = active.slice(0, MAX_CONDITIONS);

  let best: { k: number; instances: FactorInstance[] } | null = null;
  for (let k = top.length; k >= 1; k--) {
    const instances = scan(set, top.slice(0, k), horizon);
    if (instances.length >= TARGET_FACTOR_ANALOG_SAMPLE) {
      best = { k, instances };
      break;
    }
    // Otherwise remember the largest sample seen (ties keep the more specific k).
    if (!best || instances.length > best.instances.length) best = { k, instances };
  }

  const chosen = best!;
  if (chosen.instances.length < MIN_FACTOR_ANALOG_SAMPLE) {
    return {
      ok: false,
      reason: "insufficient_instances",
      bestSampleSize: chosen.instances.length,
      conditions: top.slice(0, chosen.k),
    };
  }

  return {
    ok: true,
    analogs: {
      conditions: top.slice(0, chosen.k),
      droppedConditions: active.filter((c) => !top.slice(0, chosen.k).includes(c)),
      instances: chosen.instances,
      horizonSessions: horizon,
    },
  };
}
