// Bounds for user-entered numeric amounts (holding quantity/price, calculator
// balances, alert thresholds).
//
// Two problems this closes: an unbounded field lets someone push an absurd
// value straight into the DB, and once it's stored every downstream product
// of it (portfolio value, allocation %, chart axis) is a number no format
// string handles gracefully. The client `max` attr is a hint only - the
// server re-checks with `boundedAmount()`.

/** Largest value accepted in any amount / quantity / price field. */
export const MAX_AMOUNT_INPUT = 10_000_000_000;

/** Clamp a number into [0, MAX_AMOUNT_INPUT]; non-finite or negative -> 0. */
export function clampAmount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_AMOUNT_INPUT);
}

/**
 * Bounds for the percentage-rate fields in the calculators (annual return,
 * inflation, fee drag, withdrawal rate). Without them, a fat-fingered "700"
 * instead of "7" compounds a projection into a meaningless number - and there
 * is no rate outside this range worth modelling.
 */
export const MIN_RATE_INPUT = -100;
export const MAX_RATE_INPUT = 100;

/**
 * Clamp a percentage rate into [MIN_RATE_INPUT, MAX_RATE_INPUT]; non-finite ->
 * 0. `allowNegative` defaults to false (fee, inflation and withdrawal rates
 * cannot be negative); pass true for a return rate.
 */
export function clampRate(n: number, { allowNegative = false } = {}): number {
  if (!Number.isFinite(n)) return 0;
  const lo = allowNegative ? MIN_RATE_INPUT : 0;
  return Math.min(Math.max(n, lo), MAX_RATE_INPUT);
}

/**
 * Server-side: coerce a form value to a number and validate it is a positive,
 * finite amount within bounds. Returns null when it isn't, so the action can
 * return a clear message instead of writing a bad row.
 */
export function boundedAmount(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT_INPUT) return null;
  return n;
}
