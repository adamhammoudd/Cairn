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
