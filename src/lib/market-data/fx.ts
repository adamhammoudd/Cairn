// USD -> display-currency rates for the Settings > Display > Currency control.
//
// The point of this module is that the currency setting must *convert*, not
// relabel. Swapping the "$" for a "€" in front of a number that is still
// dollars is a wrong figure on a screen someone checks a balance on - strictly
// worse than leaving it in USD and saying so.
//
// Every price Cairn stores is in the symbol's listing currency, which for the
// tracked universe is USD. So conversion needs one real rate per display
// currency, sourced the same way every other price is: the market-data
// provider, which already covers forex pairs (lib/market-data/provider.ts).
//
// When no rate can be sourced - no TWELVE_DATA_API_KEY, provider down, pair
// not carried - this returns null and every caller falls back to USD *and
// says it did*. It never invents a rate and never applies a stale one without
// dating it.

import { fetchQuote } from "@/lib/market-data/provider";

export interface FxRate {
  /** Multiply a USD figure by this to get the display currency. */
  rate: number;
  /** ISO timestamp the rate was quoted at, shown wherever it is applied. */
  asOf: string;
}

/**
 * Currencies offered in Settings. Kept short deliberately: each one is a live
 * provider call, and offering a currency whose pair the provider does not
 * carry would put an un-convertible option in a menu.
 */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Rate to convert USD into `target`. Returns `{ rate: 1 }` for USD without a
 * network call, and null when the pair cannot be sourced right now.
 */
export async function fetchUsdRate(target: string): Promise<FxRate | null> {
  if (target === "USD") return { rate: 1, asOf: new Date().toISOString() };
  if (!isSupportedCurrency(target)) return null;

  // Twelve Data's forex pair form. `close` on a forex quote is the rate.
  const quote = await fetchQuote(`USD/${target}`);
  if (!quote || quote.price === null || !Number.isFinite(quote.price) || quote.price <= 0) return null;

  return { rate: quote.price, asOf: quote.fetchedAt };
}
