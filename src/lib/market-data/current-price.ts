// The live-quote layer, structurally separate from historical_prices (the
// Phase 4 pattern-matching trend store, see lib/ai/generate.ts and
// lib/ai/analytics.ts). Historical/trend queries keep reading
// historical_prices directly - this module exists only for "what is this
// worth right now" reads (ticker headline price, holdings valuation), which
// were previously just taking the trend store's latest row and presenting
// it as current.
//
// Falls back to that same latest-row read when no live feed is configured
// (TIINGO_API_KEY unset) or the live call fails, but every result is
// tagged with its actual source AND the date it is as of, so a fallback read
// is never presented to a user as live and every surface can say how old it
// is in the same words.

import { createClient } from "@/lib/supabase/server";
import { MIGRATIONS, unwrapRows } from "@/lib/supabase/read";
import { isStaleClose, STALE_AFTER_HOURS } from "@/lib/market-data/stale";
import { describePriceFreshness } from "@/lib/price-freshness";
import { fetchQuote, isMarketDataProviderConfigured } from "@/lib/market-data/provider";

export interface CurrentPrice {
  symbol: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  source: "live" | "last_close";
  /** Date of the bar (or quote) this price came from, YYYY-MM-DD. */
  asOf: string | null;
  /**
   * Session figures from the SAME source as `price`. Mixing a live price with
   * the stored daily bar is what produced a headline price outside its own
   * "day range" on the ticker page.
   */
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
}

interface Bar {
  symbol: string;
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  asset_type: string;
}

// Two most recent bars per symbol, with a per-symbol limit. The previous
// version ordered every row for every symbol by ts and let PostgREST's row cap
// decide what came back: a symbol whose last ingest is older than the others
// falls off the end of that shared window entirely and reads as having no
// price at all. recent_prices() gives each symbol its own LIMIT.
async function lastBars(symbols: string[], perSymbol = 2): Promise<Map<string, Bar[]>> {
  const bySymbol = new Map<string, Bar[]>();
  if (symbols.length === 0) return bySymbol;

  const supabase = await createClient();
  // This is the read behind every headline price in the app, the portfolio's
  // total, and the ticker's stat block. Swallowing its error is what turned a
  // missing 0027 into "$0" on Portfolio instead of an error.
  const res = await supabase.rpc("recent_prices", { symbols, per_symbol: perSymbol });

  for (const row of unwrapRows("Latest prices (recent_prices)", res, MIGRATIONS.onDemandIngestion) as Bar[]) {
    const arr = bySymbol.get(row.symbol) ?? [];
    arr.push(row);
    bySymbol.set(row.symbol, arr);
  }
  // recent_prices returns newest-first within a symbol; make that explicit
  // rather than relying on it.
  for (const arr of bySymbol.values()) arr.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return bySymbol;
}

/**
 * Group already-fetched bars by symbol, newest-first - so a caller that has
 * just read a wide window of history (the Portfolio page's recent_prices
 * call for the timeline) can hand it to getLatestCloses()/latestDataDate()
 * instead of each of those firing its own recent_prices round trip.
 */
export function groupBarsBySymbol(rows: Bar[]): Map<string, Bar[]> {
  const bySymbol = new Map<string, Bar[]>();
  for (const row of rows) {
    const arr = bySymbol.get(row.symbol) ?? [];
    arr.push(row);
    bySymbol.set(row.symbol, arr);
  }
  for (const arr of bySymbol.values()) arr.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return bySymbol;
}

const num = (v: number | null | undefined) => (v == null ? null : Number(v));

// The live-quote providers need to know a coin is a coin: `fetchQuote("BTC")`
// against the bare ticker returns Grayscale Bitcoin Mini Trust ETF (~$34), not
// Bitcoin. Only the crypto/non-crypto distinction matters to the quote path.
const cryptoHint = (assetType: string | null | undefined): "crypto" | undefined =>
  assetType === "crypto" ? "crypto" : undefined;

function toLastClosePrice(symbol: string, rows: Bar[]): CurrentPrice {
  // numeric columns arrive as strings over PostgREST; coerce before any math.
  const latest = rows[0];
  const prev = rows[1];
  const price = num(latest?.close);
  const prevClose = num(prev?.close);
  return {
    symbol,
    price,
    changePct: price !== null && prevClose !== null && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null,
    volume: latest?.volume ?? null,
    source: "last_close",
    asOf: latest?.ts ?? null,
    open: num(latest?.open),
    dayHigh: num(latest?.high),
    dayLow: num(latest?.low),
  };
}

// Crypto trades 24/7, so "change" has two different and both-defensible
// meanings, and the app was showing one on each surface: the Markets crypto
// tab read crypto_metrics.price_change_24h_pct (CoinGecko's rolling 24 hours)
// while the ticker page derived it from the last two daily closes. For BTC in
// one session that was +5.70% against -0.15% - same asset, same minute, two
// screens, and no way for a reader to tell which to believe.
//
// The rolling figure wins for crypto, because a close-to-close delta on a
// market that never closes is an arbitrary midnight-to-midnight slice. Equities
// keep close-to-close, which is what a daily change means for a session-based
// market. Every surface now routes through cryptoRolling24hFor() so the choice
// is made once.
export async function cryptoRolling24hFor(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (symbols.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("crypto_metrics").select("symbol, price_change_24h_pct").in("symbol", symbols);
  for (const row of data ?? []) {
    if (row.price_change_24h_pct != null) out.set(row.symbol, Number(row.price_change_24h_pct));
  }
  return out;
}

export async function getCurrentPrice(symbol: string): Promise<CurrentPrice> {
  // Read the stored bars first - they are the fallback either way, and their
  // asset_type is what tells the live-quote path to ask for `BTC/USD` rather
  // than the bare `BTC` ticker (a different, ~$34 listing).
  const rows = (await lastBars([symbol])).get(symbol) ?? [];
  const hint = cryptoHint(rows[0]?.asset_type);

  if (isMarketDataProviderConfigured()) {
    const quote = await fetchQuote(symbol, hint);
    if (quote && quote.price !== null) {
      // Honest source: a quote pulled while the market is CLOSED is the last
      // session's close, not a live price. Label it "last_close" and date it
      // to the provider's own quote date, so a Friday number never shows as
      // "Live" on a Sunday. Crypto trades 24/7, so its quote is genuinely live.
      const isLive = quote.marketOpen || hint === "crypto";
      return {
        symbol: quote.symbol,
        price: quote.price,
        changePct: quote.changePercent,
        volume: quote.volume,
        source: isLive ? "live" : "last_close",
        asOf: quote.quoteDate ?? quote.fetchedAt.slice(0, 10),
        // From the quote itself: a live price with a stored day range can
        // contradict itself, which is exactly what /ticker/AAPL displayed.
        open: quote.open,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
      };
    }
  }

  const base = toLastClosePrice(symbol, rows);
  if (rows[0]?.asset_type !== "crypto") return base;

  // Falls back to close-to-close when the coin has no metrics row yet, so a
  // newly-ingested symbol still shows a change rather than a blank.
  const rolling = (await cryptoRolling24hFor([symbol])).get(symbol);
  return rolling === undefined ? base : { ...base, changePct: rolling };
}

export { STALE_AFTER_HOURS, isStaleClose };

export interface LatestClose {
  latest: number | null;
  prev: number | null;
  /**
   * True only when we fell back to a stored daily close (no live quote
   * attempted or available) AND that close is old enough to be misleading
   * as "the current price" - the Holdings-table BTC bug from the 2026-09-04
   * walkthrough: its last bar was 5 days old while Ticker/Calculators, which
   * go through the same live-quote attempt, happened to get one. Surfacing
   * this lets the table say so instead of quietly showing a stale number as
   * if it were live.
   */
  stale: boolean;
  /** Date the returned price is as of (bar date, or the live quote's own date). */
  asOf: string | null;
  /** True only for an in-session live quote (never a stored close). */
  live: boolean;
}

// Drop-in replacement for `latestCloseBySymbol(historical_prices rows)` used
// by portfolio valuation - same {latest, prev} shape (plus `stale`/`asOf`,
// additive so existing callers reading only .latest/.prev are unaffected), so
// lib/portfolio.ts's pure functions need no changes, only the data source at
// the call site.
export async function getLatestCloses(
  symbols: string[],
  /** Bars the caller already fetched (Portfolio's timeline read) - skips a recent_prices round trip. */
  prefetchedBars?: Map<string, Bar[]>,
  /**
   * Each symbol's own stored `holdings.asset_type` - the ground truth the
   * Edit-asset modal writes to. Preferred over inferring the type from
   * `historical_prices` bars, which silently falls through to "no hint" (and
   * a live quote can then resolve to a same-ticker-different-instrument,
   * e.g. `BTC` the equity ticker instead of the coin) for any symbol whose
   * bars are missing, stale, or reordered.
   */
  assetTypeBySymbol?: Map<string, string>,
): Promise<Map<string, LatestClose>> {
  const result = new Map<string, LatestClose>();
  if (symbols.length === 0) return result;

  const bySymbol = prefetchedBars ?? (await lastBars(symbols));

  // The live-quote provider is quota-limited (Tiingo Starter: 50 req/hour) -
  // only worth attempting live fetches for a small symbol set (a user's own holdings), never a
  // screener-sized batch, which keeps reading the trend store's daily
  // change directly (that's what a screener conventionally shows anyway).
  const tryLive = isMarketDataProviderConfigured() && symbols.length <= 8;

  // One round trip, not one per holding. Each fetchQuote() is independently
  // cached (revalidate: 60), so a symbol two users both hold is fetched once
  // per minute across the whole app, not once per page render.
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const rows = bySymbol.get(symbol) ?? [];
      const assetType = assetTypeBySymbol?.get(symbol) ?? rows[0]?.asset_type;
      if (tryLive) {
        const quote = await fetchQuote(symbol, cryptoHint(assetType));
        if (quote && quote.price !== null) {
          // A quote taken while the market is open is compared to the last
          // stored close; a closed-market quote IS ~the last close, so its
          // predecessor is the one before that.
          const prev = quote.marketOpen ? num(rows[0]?.close) : num(rows[1]?.close);
          const asOf = quote.quoteDate ?? quote.fetchedAt.slice(0, 10);
          return [symbol, { latest: quote.price, prev, stale: false, asOf, live: quote.marketOpen || cryptoHint(assetType) === "crypto" }] as const;
        }
      }
      const fallback = toLastClosePrice(symbol, rows);
      const asOf = fallback.asOf;
      return [
        symbol,
        { latest: fallback.price, prev: num(rows[1]?.close), stale: describePriceFreshness({ source: "last_close", asOf, assetType }).stale, asOf, live: false },
      ] as const;
    }),
  );
  for (const [symbol, value] of entries) result.set(symbol, value);
  return result;
}

/**
 * The as-of date of the newest bar the app holds for these symbols, for the
 * shared freshness label. Null when none of them have any history.
 */
export async function latestDataDate(
  symbols: string[],
  prefetchedBars?: Map<string, Bar[]>,
): Promise<string | null> {
  const bySymbol = prefetchedBars ?? (await lastBars(symbols, 1));
  // The date of the newest EXCHANGE close, so one crypto bar dated today does
  // not make the whole page say "close of <today>" while equities are a day
  // behind (audit 1.4). Crypto only decides it when nothing else is held.
  let newestExchange: string | null = null;
  let newestAny: string | null = null;
  for (const rows of bySymbol.values()) {
    const ts = rows[0]?.ts ?? null;
    if (!ts) continue;
    if (newestAny === null || ts > newestAny) newestAny = ts;
    if (rows[0].asset_type !== "crypto" && (newestExchange === null || ts > newestExchange)) newestExchange = ts;
  }
  return newestExchange ?? newestAny;
}
