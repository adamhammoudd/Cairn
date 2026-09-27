// Constants and types for the analysis generation pipeline. Kept out of
// lib/actions/analysis.ts for the same reason lib/billing.ts exists: a
// "use server" module may only export async functions, so a plain `const`
// there silently strips every export from the module.

/**
 * Outcome of a generation run. `kind` maps an internal failure onto the state
 * the UI already renders: "quota" -> the quota-reached panel, "unavailable" ->
 * the not-enough-history panel. A raw internal error is never surfaced as the
 * analysis result.
 */
/**
 * Human labels for `historical_events.event_type`.
 *
 * Every surface that shows an analog used to print the raw column value, which
 * was tolerable while the vocabulary was all single words ("earnings",
 * "dividend"). It stopped being tolerable when the analysis engine started
 * deriving its own analogs: `factor_signal` rendered as "factor_signal",
 * "Factor_signal" or "FACTOR_SIGNAL" depending on the surface, and for most
 * tickers it is now the MAJORITY of the analogs shown (RKLB: 41 of 46).
 *
 * "Price-history signal" rather than "factor signal" because it says what the
 * analog actually is - a past day in this symbol's own price history that
 * looked like today - instead of naming the internal machinery.
 *
 * Unknown types fall back to the underscored value spaced out, so a type added
 * to the database before it is added here degrades quietly instead of showing
 * a blank.
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  earnings: "Earnings",
  split: "Split",
  dividend: "Dividend",
  macro: "Macro",
  ipo: "IPO",
  guidance: "Guidance",
  volatility_regime: "Volatility regime",
  factor_signal: "Price-history signal",
};

export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replace(/_/g, " ");
}

export type GenerateOutcome =
  | { ok: true; analysisId: string }
  | { ok: false; kind: "quota" | "unavailable" | "error"; message: string; young?: YoungHistoryInfo };

/**
 * Present on an "unavailable" outcome when the symbol is simply too new for
 * the analog scan (lib/ai/history-depth.ts). The panel shows this instead of
 * the generic thin-data wording.
 */
export interface YoungHistoryInfo {
  message: string;
  /** A labelled benchmark base rate - never the symbol's own history. */
  comparison: string | null;
  bars: number;
  benchmark: string | null;
}

/**
 * The one wording for the thin-data case. Every surface renders this exact
 * string - Research page and chat alike - so a failure never reads differently
 * depending on where the run was triggered from.
 */
export const UNAVAILABLE_MESSAGE =
  "Not enough historical data available for this scope yet - too few comparable situations in the record to put a confidence range on.";

/**
 * Shown when the model provider was reachable but would not serve the request -
 * rate limit, daily token quota, overload - after the retry and fallback chain
 * in lib/ai/llm.ts has already been exhausted.
 *
 * The provider's own error text is deliberately NOT included. It carries the
 * org id, model id, service tier and remaining-quota figures, and this string
 * renders straight into the page.
 */
export const BUSY_MESSAGE =
  "The analysis engine is at capacity right now. Nothing was charged against your quota - try again in a few minutes.";

/**
 * The catch-all. Anything that is not a thin-data case and not a provider
 * capacity failure is a bug, and the user gets a fixed string while the real
 * error goes to the server log. Never interpolate an exception message here:
 * this path has surfaced raw provider payloads and truncated model output
 * directly to the browser.
 */
export const GENERIC_ERROR_MESSAGE =
  "Something went wrong generating that analysis. It has been logged - please try again.";

/**
 * The market-data provider has no such symbol (a typo, a delisted ticker, an
 * instrument type Cairn does not carry). Deliberately NOT the thin-data
 * wording: "too few comparable situations" would tell the reader their ticker
 * is real but young, when the truth is we could not find it at all.
 */
export const SYMBOL_UNAVAILABLE_MESSAGE =
  "We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet.";

/**
 * The provider (or Cairn's own request budget for it) refused the fetch while
 * pulling a symbol's price history for the first time. Nothing was analysed
 * and nothing is charged; the symbol is not marked as missing.
 */
export const DATA_BUSY_MESSAGE =
  "We couldn't fetch this ticker's price history just now - the market-data provider is busy. Nothing was charged against your quota - try again in a minute.";
