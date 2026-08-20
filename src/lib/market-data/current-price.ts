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
// tagged with its actual source so a fallback read is never presented to a
// user as live.

import { createClient } from "@/lib/supabase/server";
import { fetchQuote, isMarketDataProviderConfigured } from "@/lib/market-data/provider";

export interface CurrentPrice {
  symbol: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  source: "live" | "last_close";
}

async function lastCloseRows(symbols: string[]): Promise<Map<string, { close: number | null; volume: number | null }[]>> {
  const supabase = await createClient();
  const { data: bars } = await supabase
    .from("historical_prices")
    .select("symbol, ts, close, volume")
    .in("symbol", symbols)
    .order("ts", { ascending: false });

  const bySymbol = new Map<string, { close: number | null; volume: number | null }[]>();
  for (const b of bars ?? []) {
    const arr = bySymbol.get(b.symbol) ?? [];
    if (arr.length < 2) arr.push({ close: b.close, volume: b.volume });
    bySymbol.set(b.symbol, arr);
  }
  return bySymbol;
}

function toLastClosePrice(symbol: string, rows: { close: number | null; volume: number | null }[]): CurrentPrice {
  // numeric columns arrive as strings over PostgREST; coerce before any math.
  const latest = rows[0]?.close == null ? null : Number(rows[0].close);
  const prev = rows[1]?.close == null ? null : Number(rows[1].close);
  return {
    symbol,
    price: latest,
    changePct: latest !== null && prev !== null && prev !== 0 ? ((latest - prev) / prev) * 100 : null,
    volume: rows[0]?.volume ?? null,
    source: "last_close",
  };
}

export async function getCurrentPrice(symbol: string): Promise<CurrentPrice> {
  if (isMarketDataProviderConfigured()) {
    const quote = await fetchQuote(symbol);
    if (quote && quote.price !== null) {
      return { symbol: quote.symbol, price: quote.price, changePct: quote.changePercent, volume: quote.volume, source: "live" };
    }
  }
  const rows = (await lastCloseRows([symbol])).get(symbol) ?? [];
  return toLastClosePrice(symbol, rows);
}

// Drop-in replacement for `latestCloseBySymbol(historical_prices rows)` used
// by portfolio valuation - same {latest, prev} shape, so lib/portfolio.ts's
// pure functions need no changes, only the data source at the call site.
export async function getLatestCloses(symbols: string[]): Promise<Map<string, { latest: number | null; prev: number | null }>> {
  const result = new Map<string, { latest: number | null; prev: number | null }>();
  if (symbols.length === 0) return result;

  const bySymbol = await lastCloseRows(symbols);

  // Twelve Data's free tier is 8 req/min - only worth attempting live
  // fetches for a small symbol set (a user's own holdings), never a
  // screener-sized batch, which keeps reading the trend store's daily
  // change directly (that's what a screener conventionally shows anyway).
  const tryLive = isMarketDataProviderConfigured() && symbols.length <= 8;

  for (const symbol of symbols) {
    const rows = bySymbol.get(symbol) ?? [];
    if (tryLive) {
      const quote = await fetchQuote(symbol);
      if (quote && quote.price !== null) {
        result.set(symbol, { latest: quote.price, prev: rows[0]?.close == null ? null : Number(rows[0].close) });
        continue;
      }
    }
    const fallback = toLastClosePrice(symbol, rows);
    result.set(symbol, { latest: fallback.price, prev: rows[1]?.close == null ? null : Number(rows[1].close) });
  }
  return result;
}
