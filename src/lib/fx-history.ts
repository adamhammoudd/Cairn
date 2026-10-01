// The exchange rate a holding was bought at (fix/cost-basis-fx).
//
// Cairn stores every price and every purchase price in dollars and converts the
// reader's own money to their display currency for display (lib/display-prefs.ts).
// It used to convert the cost basis at TODAY's rate, so a EUR reader's gain on a
// dollar holding left out the euro's move since they bought - Yahoo Finance and
// every euro broker convert the cost at the rate on the purchase date, and
// showed EUR 9.20 where Cairn showed EUR 2.78 for the same four holdings.
//
// The rate is the ECB reference rate (the same source as today's rate, see
// market-data/fx.ts) on the purchase date: the last one published on or before
// it, so a weekend or holiday takes the previous business day.
//
// The units the rest of the app already uses are kept on purpose. A figure is
// "USD at today's rate": multiply by DisplayPrefs.fxRate and you have the
// display currency. A cost converted at the purchase-date rate is therefore
// carried as costUsd * (rateOnPurchaseDate / rateToday), so every existing
// formatter shows the right number without learning a second kind of money, and
// a USD reader (ratio 1 everywhere) is untouched.
//
// Plain module (no server imports) so client components and tests can use it.

/** USD -> display currency, by ECB publication date, plus today's rate. */
export interface CostFx {
  /** The display currency the rates convert into. */
  currency: string;
  /** USD -> currency now. Always the same number as DisplayPrefs.fxRate. */
  today: number;
  /** Ascending [YYYY-MM-DD, USD -> currency]. Empty when no history could be read. */
  points: ReadonlyArray<readonly [string, number]>;
}

/**
 * How far past the newest stored rate a date may be and still use it. The
 * table is refreshed daily; a gap longer than a long weekend means it has gone
 * stale, and guessing across it would be inventing a rate.
 */
export const MAX_RATE_GAP_DAYS = 7;

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

/**
 * USD -> display currency on `date`: the last rate published on or before it.
 * Null - never a guess - when there is no history, the date is missing or not a
 * date, it is older than the first rate held, or it is further past the newest
 * rate than a weekend or holiday can explain. Callers fall back to today's rate
 * and say so.
 */
export function rateOn(fx: CostFx | null, date: string | null | undefined): number | null {
  if (!fx || fx.points.length === 0) return null;
  if (typeof date !== "string" || !ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  const pts = fx.points;
  if (date < pts[0][0]) return null;
  // Last point with point.date <= date.
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid][0] <= date) lo = mid;
    else hi = mid - 1;
  }
  const [foundDate, rate] = pts[lo];
  if (dayNumber(date) - dayNumber(foundDate) > MAX_RATE_GAP_DAYS) return null;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Which rate a cost used: the purchase date's, today's because none is held for
 * that date, or "same-currency" - nothing was converted (a USD reader).
 */
export type CostRate = "purchase-date" | "today-rate" | "same-currency";

/**
 * How to carry a USD amount dated `date` into "USD at today's rate" units.
 * `ratio` multiplies the dollars; `basis` says which rate it used.
 */
export function costRatio(fx: CostFx | null, date: string | null | undefined): { ratio: number; basis: CostRate } {
  if (!fx) return { ratio: 1, basis: "same-currency" };
  const r = rateOn(fx, date);
  if (r === null || !(fx.today > 0)) return { ratio: 1, basis: "today-rate" };
  return { ratio: r / fx.today, basis: "purchase-date" };
}
