// USD -> display-currency rates for the Settings > Display > Currency control.
//
// The point of this module is that the currency setting must *convert*, not
// relabel. Swapping the "$" for a "€" in front of a number that is still
// dollars is a wrong figure on a screen someone checks a balance on - strictly
// worse than leaving it in USD and saying so.
//
// Every price Cairn stores is in the symbol's listing currency, which for the
// tracked universe is USD. So conversion needs one real rate per display
// currency.
//
// Source: the European Central Bank's euro foreign exchange reference rates -
// official, free, keyless, published once per TARGET working day at around
// 16:00 CET. This used to be the market-data provider's forex quote
// (fetchQuote("USD/EUR")), which returns null whenever TIINGO_API_KEY is unset -
// and it is deliberately unset in production (redistribution licence, see
// provider.ts) - so every non-USD choice silently fell back to USD.
//
// The ECB quotes everything against the euro, so USD -> X is a cross rate:
// (EUR -> X) / (EUR -> USD). The rate is dated with the ECB publication date,
// not the time it was fetched: a reference rate is a daily figure, and dating
// it "now" would overstate how current it is.
//
// When no rate can be sourced - the ECB unreachable, a malformed file, a
// currency missing from it - this returns null and every caller falls back to
// USD *and says it did*. It never invents a rate.

export interface FxRate {
  /** Multiply a USD figure by this to get the display currency. */
  rate: number;
  /** ECB publication date of the reference rate (YYYY-MM-DD); today for USD. */
  asOf: string;
  /** Who published the rate, shown next to it. */
  source: "ECB" | null;
}

/** Currencies offered in Settings. Every one is in the ECB's daily set (EUR as the base). */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/**
 * The rates change once a day. Re-checking every few hours picks up the new
 * set the same afternoon without a request per page view.
 */
const REVALIDATE_SECONDS = 4 * 60 * 60;

export interface EcbDaily {
  /** Publication date, YYYY-MM-DD. */
  date: string;
  /** Units of each currency per 1 EUR. EUR itself is 1. */
  perEur: Record<string, number>;
}

/** Parse the ECB daily XML. Returns null if it is not the shape the ECB publishes. */
export function parseEcbDaily(xml: string): EcbDaily | null {
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!date) return null;
  const perEur: Record<string, number> = { EUR: 1 };
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g)) {
    const rate = Number(m[2]);
    if (Number.isFinite(rate) && rate > 0) perEur[m[1]] = rate;
  }
  return Object.keys(perEur).length > 1 ? { date, perEur } : null;
}

/** USD -> target from an ECB set, or null if either leg is missing. */
export function usdCrossRate(daily: EcbDaily, target: string): number | null {
  const usd = daily.perEur.USD;
  const x = daily.perEur[target];
  if (!usd || !x) return null;
  return x / usd;
}

type FetchLike = (url: string, init?: RequestInit & { next?: { revalidate: number } }) => Promise<Response>;

/**
 * Rate to convert USD into `target`. `{ rate: 1 }` for USD without a network
 * call; null when the rate cannot be sourced right now. `fetchImpl` is for
 * tests.
 */
export async function fetchUsdRate(target: string, fetchImpl: FetchLike = fetch): Promise<FxRate | null> {
  if (target === "USD") return { rate: 1, asOf: new Date().toISOString().slice(0, 10), source: null };
  if (!isSupportedCurrency(target)) return null;

  let daily: EcbDaily | null = null;
  try {
    const res = await fetchImpl(ECB_DAILY_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error(`[fx] ECB reference rates: HTTP ${res.status}`);
      return null;
    }
    daily = parseEcbDaily(await res.text());
  } catch (err) {
    console.error("[fx] ECB reference rates unreachable", err instanceof Error ? err.message : err);
    return null;
  }
  if (!daily) {
    console.error("[fx] ECB reference rates: unrecognised response");
    return null;
  }

  const rate = usdCrossRate(daily, target);
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  return { rate, asOf: daily.date, source: "ECB" };
}

// ---------------------------------------------------------------- history
//
// The same ECB reference rates, as a daily history, for converting a cost at the
// rate on its purchase date (lib/fx-history.ts, migration 0065 fx_rates_daily).
// Same publisher, same file format, no new provider.

/** The full history since 1999, and the last 90 days. Both are the ECB's own files. */
export const ECB_HIST_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
export const ECB_HIST_90D_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

/**
 * Every publication in an ECB history file, reduced to the currencies Settings
 * offers (plus USD, the cross leg). The full file is ~8 MB covering 30
 * currencies; nothing else is stored. Oldest first.
 */
export function parseEcbHistory(xml: string): EcbDaily[] {
  const keep = new Set<string>(["USD", ...SUPPORTED_CURRENCIES]);
  const out: EcbDaily[] = [];
  for (const day of xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)) {
    const perEur: Record<string, number> = { EUR: 1 };
    for (const m of day[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g)) {
      const rate = Number(m[2]);
      if (keep.has(m[1]) && Number.isFinite(rate) && rate > 0) perEur[m[1]] = rate;
    }
    if (perEur.USD) out.push({ date: day[1], perEur });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** fx_rates_daily rows for a parsed history (EUR is the base, so it is not stored). */
export function ecbHistoryRows(days: EcbDaily[]): { date: string; currency: string; rate_per_eur: number }[] {
  return days.flatMap((d) =>
    Object.entries(d.perEur)
      .filter(([currency]) => currency !== "EUR")
      .map(([currency, rate_per_eur]) => ({ date: d.date, currency, rate_per_eur })),
  );
}
