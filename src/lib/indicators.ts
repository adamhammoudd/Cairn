// Technical indicators, computed from the daily closes already in the trend
// store. Pure functions over a number[] so they are testable without a
// database and reusable by any surface.
//
// Every series is returned aligned to the input array, with `null` for the
// leading positions where the indicator has no value yet (an SMA(50) has no
// value until the 50th bar). Emitting a number there - carrying the first
// value backwards, or starting the line partway along a differently-indexed
// array - is how an overlay ends up drawn against the wrong dates.

/** Simple moving average. */
export function sma(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("sma: period must be positive");
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` bars. */
export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("ema: period must be positive");
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Relative strength index, Wilder's smoothing (the standard 14-period form).
 * Returns 0-100; a period of all-gains yields 100 rather than dividing by zero.
 */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export interface MacdSeries {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/** MACD: fast EMA - slow EMA, with an EMA of that line as the signal. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) =>
    fastEma[i] === null || slowEma[i] === null ? null : (fastEma[i] as number) - (slowEma[i] as number),
  );

  // The signal line is an EMA of the MACD line, which only exists from the
  // slow period onward - so it is computed over the defined slice and mapped
  // back to the original indices rather than over the padded array.
  const firstDefined = macdLine.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  if (firstDefined !== -1) {
    const defined = macdLine.slice(firstDefined) as number[];
    const signalDefined = ema(defined, signalPeriod);
    for (let i = 0; i < signalDefined.length; i++) signal[firstDefined + i] = signalDefined[i];
  }

  const histogram: (number | null)[] = values.map((_, i) =>
    macdLine[i] === null || signal[i] === null ? null : (macdLine[i] as number) - (signal[i] as number),
  );

  return { macd: macdLine, signal, histogram };
}

export const INDICATOR_COLOURS = {
  sma: "#5B8DEF",
  ema: "#D9A441",
  rsi: "#9B8CE0",
  macd: "#5B8DEF",
  signal: "#D9A441",
} as const;
