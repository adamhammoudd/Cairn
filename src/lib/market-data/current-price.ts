// The live-quote layer, structurally separate from historical_prices (the
// Phase 4 pattern-matching trend store, see lib/ai/generate.ts and
// lib/ai/analytics.ts). Historical/trend queries keep reading
// historical_prices directly - this module exists only for "what is this
// worth right now" reads (ticker headline price, holdings valuation), which
// were previously just taking the trend store's latest row and presenting
// it as current.
//
// Falls back to that same latest-row read when no live feed is configured
// (TWELVE_DATA_API_KEY unset) or the live call fails, but every result is
// tagged with its actual source AND the date it is as of, so a fallback read
// is never presented to a user as live and every surface can say how old it
// is in the same words.

import { createClient } from "@/lib/supabase/server";
import { MIGRATIONS, unwrapRows } from "@/lib/supabase/read";
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

// Drop-in replacement for `latestCloseBySymbol(historical_prices rows)` used
// by portfolio valuation - same {latest, prev} shape, so lib/portfolio.ts's
// pure functions need no changes, only the data source at the call site.
export async function getLatestCloses(symbols: string[]): Promise<Map<string, { latest: number | null; prev: number | null }>> {
  const result = new Map<string, { latest: number | null; prev: number | null }>();
  if (symbols.length === 0) return result;

  const bySymbol = await lastBars(symbols);

  // Twelve Data's free tier is 8 req/min - only worth attempting live
  // fetches for a small symbol set (a user's own holdings), never a
  // screener-sized batch, which keeps reading the trend store's daily
  // change directly (that's what a screener conventionally shows anyway).
  const tryLive = isMarketDataProviderConfigured() && symbols.length <= 8;

  // One round trip, not one per holding. Each fetchQuote() is independently
  // cached (revalidate: 60), so a symbol two users both hold is fetched once
  // per minute across the whole app, not once per page render.
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const rows = bySymbol.get(symbol) ?? [];
      if (tryLive) {
        const quote = await fetchQuote(symbol, cryptoHint(rows[0]?.asset_type));
        if (quote && quote.price !== null) {
          // A quote taken while the market is open is compared to the last
          // stored close; a closed-market quote IS ~the last close, so its
          // predecessor is the one before that.
          const prev = quote.marketOpen ? num(rows[0]?.close) : num(rows[1]?.close);
          return [symbol, { latest: quote.price, prev }] as const;
        }
      }
      const fallback = toLastClosePrice(symbol, rows);
      return [symbol, { latest: fallback.price, prev: num(rows[1]?.close) }] as const;
    }),
  );
  for (const [symbol, value] of entries) result.set(symbol, value);
  return result;
}

/**
 * The as-of date of the newest bar the app holds for these symbols, for the
 * shared freshness label. Null when none of them have any history.
 */
export async function latestDataDate(symbols: string[]): Promise<string | null> {
  const bySymbol = await lastBars(symbols, 1);
  let newest: string | null = null;
  for (const rows of bySymbol.values()) {
    const ts = rows[0]?.ts ?? null;
    if (ts && (newest === null || ts > newest)) newest = ts;
  }
  return newest;
}
