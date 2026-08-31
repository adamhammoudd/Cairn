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
  return value.toLocaleString(undefined, { style: "currency", currency: prefs.effectiveCurrency, notation });
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

/**
 * Label a figure the user typed in, in their display currency, WITHOUT
 * converting it.
 *
 * The calculators are the case this exists for: someone entering a 10,000
 * starting balance means 10,000 of whatever they think in, so running it
 * through the USD->display rate would silently rewrite their own input. They
 * still need the right symbol on the output, though - projecting a euro
 * balance and printing "$" is its own small lie.
 *
 * Anything sourced from market data must use formatMoney() instead, which
 * converts. The distinction is the whole point of having two functions.
 */
export function formatAmount(
  value: number | null | undefined,
  prefs: DisplayPrefs,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: prefs.effectiveCurrency,
    ...options,
  });
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
export function formatChange(
  absoluteUsd: number | null | undefined,
  pct: number | null | undefined,
  prefs: DisplayPrefs,
  digits = 2,
): string {
  return prefs.metricStyle === "absolute" ? formatSignedMoney(absoluteUsd, prefs) : formatPercent(pct, digits);
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
 * Density class for a table/list row. One helper rather than a conditional at
 * every call site, so "compact" means the same thing on Holdings, Markets,
 * Watchlists and the Screener.
 */
export function rowDensityClass(compact: boolean): string {
  return compact ? "py-2" : "";
}
