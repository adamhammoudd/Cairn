// The Display settings, resolved once per request and shared by every surface
// that renders money or a change figure - and the money formatters, split into
// asset money (never converted) and the reader's own money (converted).
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
  /** ECB publication date (YYYY-MM-DD) of the rate, so a converted figure can be dated. */
  fxAsOf: string | null;
  /** Publisher of the rate ("ECB"), null when nothing was converted. */
  fxSource: "ECB" | null;
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
  fxSource: null,
  fxUnavailable: false,
  metricStyle: "percent",
  compactMode: false,
  extendedHours: false,
  defaultChartView: "1D",
};

// ------------------------------------------------------------------ money
//
// Two kinds of money, two formatters (feat/native-currency):
//
//  - ASSET money - anything that describes a share, fund or coin: its price,
//    chart, 52-week range, market cap, screener and market lists, alert
//    thresholds, analysis figures. Shown in the asset's OWN currency and never
//    converted, like Yahoo Finance and TradingView. Converting NVIDIA's price
//    at today's ECB rate mixes the stock's move with the currency's move, and
//    the figure stops matching the filings and the news.
//  - USER money - the reader's own: portfolio value, holdings values, gains,
//    allocation, dashboard and briefing totals. Converted from USD to the
//    display currency at the ECB reference rate, as before.
//
// There is deliberately no plain `formatMoney`: every call site picks one.

/**
 * The reader's own money (portfolio, holdings values, gains), converted from
 * USD to their display currency. Never use this for an asset's price - that is
 * formatAssetMoney.
 */
export function formatUserMoney(usd: number | null | undefined, prefs: DisplayPrefs): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  return currencyString(usd * prefs.fxRate, prefs.effectiveCurrency);
}

/** Label appended to an asset figure whose currency isn't known. */
export const CURRENCY_UNKNOWN = "currency unknown";

/**
 * An asset figure (price, range, market cap) in the asset's own currency,
 * never converted. `assetCurrency` comes from lib/asset-currency.ts; null means
 * it isn't known, and the figure says so instead of wearing a guessed symbol.
 */
export function formatAssetMoney(value: number | null | undefined, assetCurrency: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (!assetCurrency) return `${plainAmount(value)} (${CURRENCY_UNKNOWN})`;
  return currencyString(value, assetCurrency);
}

function currencyString(value: number, currency: string): string {
  // Safety net: a genuinely enormous figure gets compact notation rather than
  // a 20-digit string that overflows every cell it lands in. Ordinary money
  // (below a quadrillion) is unaffected.
  const notation = Math.abs(value) >= 1e15 ? "compact" : "standard";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    notation,
    ...subUnitDigits(value),
  });
}

/** The number alone, with the same sub-unit precision as a currency figure. */
function plainAmount(value: number, compact = false): string {
  if (compact) return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...subUnitDigits(value) });
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
 * `threshold` it defers to formatUserMoney so small values keep their cents.
 * Use in stat tiles, table cells and chart labels - anywhere space is tight.
 */
export function formatCompactUserMoney(
  usd: number | null | undefined,
  prefs: DisplayPrefs,
  threshold = 1_000_000,
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  const value = usd * prefs.fxRate;
  if (Math.abs(value) < threshold) return formatUserMoney(usd, prefs);
  return compactCurrencyString(value, prefs.effectiveCurrency);
}

/** formatCompactUserMoney for an asset figure: its own currency, never converted. */
export function formatCompactAssetMoney(
  value: number | null | undefined,
  assetCurrency: string | null,
  threshold = 1_000_000,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (Math.abs(value) < threshold) return formatAssetMoney(value, assetCurrency);
  if (!assetCurrency) return `${plainAmount(value, true)} (${CURRENCY_UNKNOWN})`;
  return compactCurrencyString(value, assetCurrency);
}

function compactCurrencyString(value: number, currency: string): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

/** formatCompactUserMoney with an explicit leading sign - gain/loss stat tiles. */
export function formatCompactSignedUserMoney(
  usd: number | null | undefined,
  prefs: DisplayPrefs,
  threshold = 1_000_000,
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  return `${usd >= 0 ? "+" : ""}${formatCompactUserMoney(usd, prefs, threshold)}`;
}

/** A plain count in compact notation once it's large (share quantities etc.). */
export function formatCompactNumber(n: number | null | undefined, threshold = 100_000): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  if (Math.abs(n) < threshold) return n.toLocaleString();
  return n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

/** The reader's money with an explicit leading sign - gain/loss columns. */
export function formatSignedUserMoney(usd: number | null | undefined, prefs: DisplayPrefs): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
  return `${usd >= 0 ? "+" : ""}${formatUserMoney(usd, prefs)}`;
}

/**
 * A figure that is ALREADY in the display currency (not USD to convert), signed.
 * For amounts built in the display currency, like the two parts of a gain that
 * are rounded separately so that they sum.
 */
export function formatSignedDisplayMoney(
  value: number | null | undefined,
  prefs: Pick<DisplayPrefs, "effectiveCurrency">,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${currencyString(value, prefs.effectiveCurrency)}`;
}

/** An asset's move in money, signed, in its own currency. */
export function formatSignedAssetMoney(value: number | null | undefined, assetCurrency: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${formatAssetMoney(value, assetCurrency)}`;
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

/** The reader's own change (a holding's gain): money in the display currency, or percent. */
export function formatUserChange(
  absoluteUsd: number | null | undefined,
  pct: number | null | undefined,
  prefs: DisplayPrefs,
  digits = 2,
): string {
  return changeIn(formatSignedUserMoney(absoluteUsd, prefs), pct, prefs, digits);
}

/** An asset's change (a price move): money in the asset's own currency, or percent. */
export function formatAssetChange(
  absolute: number | null | undefined,
  pct: number | null | undefined,
  assetCurrency: string | null,
  prefs: DisplayPrefs,
  digits = 2,
): string {
  return changeIn(formatSignedAssetMoney(absolute, assetCurrency), pct, prefs, digits);
}

function changeIn(money: string, pct: number | null | undefined, prefs: DisplayPrefs, digits: number): string {
  if (prefs.metricStyle !== "absolute") return formatPercent(pct, digits);
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

/** The unit `formatUserChange` did not use, for surfaces that show both. */
export function formatUserSecondaryChange(
  absoluteUsd: number | null | undefined,
  pct: number | null | undefined,
  prefs: DisplayPrefs,
  digits = 2,
): string {
  return prefs.metricStyle === "absolute" ? formatPercent(pct, digits) : formatSignedUserMoney(absoluteUsd, prefs);
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
 * The reader's money rounded for a sentence ("about €250 to you"): converted,
 * no cents. `round` is the caller's rounding (lib/exposure.ts roughMoney).
 */
export function formatRoughUserMoney(usd: number, prefs: DisplayPrefs, round: (v: number) => number): string {
  return round(usd * prefs.fxRate).toLocaleString(undefined, { style: "currency", currency: prefs.effectiveCurrency, maximumFractionDigits: 0 });
}

/**
 * "≈ €192.40" - an asset figure's equivalent in the reader's display currency,
 * for the optional hint under a ticker price. Null when there is nothing to
 * convert (same currency) or no way to (the ECB rate Cairn fetches is from
 * USD, so only a USD-quoted asset can be converted).
 */
export function userEquivalent(value: number | null | undefined, assetCurrency: string | null, prefs: DisplayPrefs): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (assetCurrency !== "USD" || prefs.effectiveCurrency === "USD" || prefs.fxSource === null) return null;
  return `≈ ${formatUserMoney(value, prefs)}`;
}

/**
 * The tag a list or page shows once: "Prices in USD". A code, not a symbol -
 * "$" is also CAD's and AUD's. Mixed lists say so; an unknown currency says
 * that rather than implying dollars.
 */
export function pricesInLabel(currencies: (string | null)[]): string {
  const known = new Set(currencies.filter((c): c is string => !!c));
  const anyUnknown = currencies.some((c) => !c);
  if (known.size === 1 && !anyUnknown) return `Prices in ${[...known][0]}`;
  if (known.size === 0 && anyUnknown) return `Prices: ${CURRENCY_UNKNOWN}`;
  return "Prices in each asset's own currency";
}
