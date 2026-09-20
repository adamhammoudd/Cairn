// The Display settings, resolved once per request and shared by every surface
// that renders money or a change figure.
//
// Before this module, five of the eight Display controls were write-only:
// `default_chart_view`, `currency`, `metric_style`, `compact_mode` and
// `extended_hours` were all persisted by the settings form and read by no
// consumer anywhere in src/. The form said "Currency" and every price in the
// product was hard-coded `currency: "USD"`. That is the same defect
// refresh_rate_seconds had, five times over: a settings screen making claims
// the app does not keep.
//
// Plain module (no "use server") so both the server action that builds it and
// the client components that consume it can import the types and the
// formatters - a server-actions module may only export async functions.

import type { ChartView, MetricStyle } from "@/lib/supabase/types";

export interface DisplayPrefs {
  /** What the user picked in Settings. */
  currency: string;
  /**
   * What is actually being rendered. Equals `currency` when a rate was
   * sourced, otherwise "USD" - the UI never prints a foreign symbol in front
   * of an unconverted dollar figure.
   */
  effectiveCurrency: string;
  /** USD -> effectiveCurrency. Exactly 1 when effectiveCurrency is USD. */
  fxRate: number;
  /** When the rate was quoted, so a converted figure can be dated. */
  fxAsOf: string | null;
  /**
   * True when the user asked for a non-USD currency and no rate could be
   * sourced. Surfaces that show converted money use this to say so instead of
   * silently reverting.
   */
  fxUnavailable: boolean;
  metricStyle: MetricStyle;
  compactMode: boolean;
  extendedHours: boolean;
  defaultChartView: ChartView;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  currency: "USD",
  effectiveCurrency: "USD",
  fxRate: 1,
  fxAsOf: null,
  fxUnavailable: false,
  metricStyle: "percent",
  compactMode: false,
  extendedHours: false,
  defaultChartView: "1D",
};

/**
 * Format a USD figure in the user's display currency, converting it first.
 * Every money string in the app goes through here so a currency change cannot
 * reach some columns and miss others.
 */
export function formatMoney(usd: number | null | undefined, prefs: DisplayPrefs): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  const value = usd * prefs.fxRate;
  // Safety net: a genuinely enormous figure gets compact notation rather than
  // a 20-digit string that overflows every cell it lands in. Ordinary money
  // (below a quadrillion) is unaffected.
  const notation = Math.abs(value) >= 1e15 ? "compact" : "standard";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: prefs.effectiveCurrency,
    notation,
    ...subUnitDigits(value),
  });
}

/**
 * Extra decimal places for prices below one unit of currency.
 *
 * `style: "currency"` defaults to the currency's own minor-unit count - two for
 * EUR and USD - which is right for a portfolio total and wrong for an asset
 * that trades under a cent. 21 of the 305 tracked symbols price below EUR 0.01
 * and 147 below EUR 1, so the Markets board was rendering rows like
 * "APEPE EUR 0.00 +16.27%": a real price, a real move, and a figure that reads
 * as broken rather than as small.
 *
 * Enough decimals to carry three significant figures, capped at eight - which
 * is the convention every crypto venue uses and, not incidentally, one satoshi.
 * Values at or above 1 are untouched, so nothing else in the product moves.
 */
function subUnitDigits(value: number): { minimumFractionDigits: number; maximumFractionDigits: number } | undefined {
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 1 || !Number.isFinite(abs)) return undefined;
  // First significant digit sits at 10^floor(log10(abs)); two more after it.
  // Capped at six, not eight. Eight is the satoshi-grade figure and it is
  // honest, but "EUR 0.00000097" is eleven characters in a summary-card cell
  // sized for "EUR 164.20" and it breaks the row rhythm the dashboard is built
  // on. Six keeps every tracked asset non-zero - which was the whole point,
  // since EUR 0.00 beside +16.27% reads as broken - while staying inside the
  // column.
  const digits = Math.min(6, Math.ceil(-Math.log10(abs)) + 2);
  // Minimum stays at the currency's own two, so 0.23 renders "0.23" rather
  // than a padded "0.230"; only the ceiling moves.
  return { minimumFractionDigits: 2, maximumFractionDigits: digits };
}

/**
 * Money in compact notation ($1.2M, $340K, $4.1B) once the figure is large
 * enough that the exact digits stop mattering and the width starts to. Below
 * `threshold` it defers to formatMoney so small values keep their cents.
 * Use in stat tiles, table cells and chart labels - anywhere space is tight.
 */
export function formatCompactMoney(
  usd: number | null | undefined,
  prefs: DisplayPrefs,
  threshold = 1_000_000,
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  const value = usd * prefs.fxRate;
  if (Math.abs(value) < threshold) return formatMoney(usd, prefs);
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: prefs.effectiveCurrency,
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

/** formatCompactMoney with an explicit leading sign - gain/loss stat tiles. */
export function formatCompactSignedMoney(
  usd: number | null | undefined,
  prefs: DisplayPrefs,
  threshold = 1_000_000,
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  return `${usd >= 0 ? "+" : ""}${formatCompactMoney(usd, prefs, threshold)}`;
}

/** A plain count in compact notation once it's large (share quantities etc.). */
export function formatCompactNumber(n: number | null | undefined, threshold = 100_000): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  if (Math.abs(n) < threshold) return n.toLocaleString();
  return n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

/** Same, with an explicit leading sign - gain/loss columns. */
export function formatSignedMoney(usd: number | null | undefined, prefs: DisplayPrefs): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  return `${usd >= 0 ? "+" : ""}${formatMoney(usd, prefs)}`;
}

export function formatPercent(pct: number | null | undefined, digits = 2): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "-";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

/**
 * The change figure, in whichever of the two units the user chose.
 *
 * This is what makes `metric_style` real. Both figures are computed either
 * way; the setting decides which one is the headline. Where a surface has room
 * for both, `secondaryChange` gives the other one - so the setting reorders
 * rather than hides.
 */
/**
 * True when a formatted money string carries no significant figures - "+€0.00",
 * "-$0.00". Tested on the rendered string rather than the raw number so it
 * follows the locale's actual precision and currency, instead of assuming two
 * decimal places and a symbol we happen to know about.
 */
function roundsToZero(formatted: string): boolean {
  const digits = formatted.replace(/\D/g, "");
  return digits.length > 0 && !/[1-9]/.test(digits);
}

export function formatChange(
  absoluteUsd: number | null | undefined,
  pct: number | null | undefined,
  prefs: DisplayPrefs,
  digits = 2,
): string {
  if (prefs.metricStyle !== "absolute") return formatPercent(pct, digits);

  const money = formatSignedMoney(absoluteUsd, prefs);
  // A sub-cent asset moving 20% still moves less than one cent, so the absolute
  // unit renders "+€0.00" - which reads as "unchanged" beside a symbol that led
  // the day's gainers. Where the chosen unit has nothing to say, fall back to
  // the one that does rather than print a confident zero. The preference still
  // wins everywhere it is informative, which is everywhere else.
  if (roundsToZero(money) && pct !== null && pct !== undefined && Number.isFinite(pct) && pct !== 0) {
    return formatPercent(pct, digits);
  }
  return money;
}

/** The unit `formatChange` did not use, for surfaces that show both. */
export function formatSecondaryChange(
  absoluteUsd: number | null | undefined,
  pct: number | null | undefined,
  prefs: DisplayPrefs,
  digits = 2,
): string {
  return prefs.metricStyle === "absolute" ? formatPercent(pct, digits) : formatSignedMoney(absoluteUsd, prefs);
}

/**
 * Absolute change implied by a price and its percent move, for the rows that
 * carry only `changePct`. Derived rather than stored, and null when the move
 * would put the previous close at zero.
 */
export function absoluteChangeFrom(price: number | null, changePct: number | null): number | null {
  if (price === null || changePct === null || !Number.isFinite(price) || !Number.isFinite(changePct)) return null;
  const denominator = 100 + changePct;
  if (denominator === 0) return null;
  return price - price / (denominator / 100);
}

/**
 * Just the symbol ("€", "£", "$") for the user's display currency - for a
 * label like "Price (€)" where a full formatted amount would be wrong. Never
 * hardcode "$" in a label a non-USD account will see (the alert form's
 * "Price ($)" was exactly that).
 */
export function currencySymbol(prefs: DisplayPrefs): string {
  return (0)
    .toLocaleString(undefined, { style: "currency", currency: prefs.effectiveCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .replace(/[0-9]/g, "")
    .trim();
}
