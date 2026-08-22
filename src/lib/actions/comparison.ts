"use server";

import { createClient } from "@/lib/supabase/server";
import { cryptoRolling24hFor } from "@/lib/market-data/current-price";
import type { ComparisonRow } from "@/lib/comparison";

// The universe every symbol picker draws on (Compare, the Sector Heat Map).
//
// This used to read data_providers.config.symbols and call .toUpperCase() on
// each entry. Migration 0020 changed that array from a list of strings to a
// mix of strings and {symbol, asset_type} objects so each symbol could carry
// its own type - and this function threw "s.toUpperCase is not a function"
// from that moment on, which is a 500 on both /comparison and /sector-map.
//
// It now reads symbol_directory, which is the real answer to "what does Cairn
// have data for": the provider config only lists what the daily job refreshes,
// while anything ingested on demand is in the directory the moment it lands.
export async function getTrackedSymbols(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("symbol_directory")
    .select("symbol")
    .eq("status", "available")
    .order("symbol", { ascending: true });

  return (data ?? []).map((row) => row.symbol.toUpperCase());
}

// Derives marketCap/pe/dividendYield the same way runScreen() and
// ticker-workspace.tsx already do independently - accepted small
// duplication, the formula is already computed in three places in this
// codebase.
export async function getComparisonData(symbols: string[]): Promise<ComparisonRow[]> {
  if (symbols.length === 0) return [];
  const supabase = await createClient();

  // Per-symbol bars via recent_prices(), which gives each symbol its own LIMIT.
  // A single .in() query with a shared LIMIT has two failure modes: ordered
  // ascending it returns the *oldest* rows (so `price` was a months-stale
  // bar), and ordered descending a symbol with a longer history starves the
  // others of rows entirely.
  const [{ data: barRows }, { data: fundamentals }, { data: directory }, { data: coins }] = await Promise.all([
    supabase.rpc("recent_prices", { symbols, per_symbol: 400 }),
    supabase.from("fundamentals").select("symbol, shares_outstanding, eps_ttm, dividends_ttm").in("symbol", symbols),
    supabase.from("symbol_directory").select("symbol, asset_type, name").in("symbol", symbols),
    // A coin has no shares outstanding, so its market cap can only come from
    // crypto_metrics - without this the Compare table printed "-" for a cap
    // the Markets page showed on the same asset in the same session.
    supabase.from("crypto_metrics").select("symbol, market_cap").in("symbol", symbols),
  ]);

  const fundamentalsBySymbol = new Map((fundamentals ?? []).map((f) => [f.symbol, f]));
  const directoryBySymbol = new Map((directory ?? []).map((d) => [d.symbol, d]));
  const capBySymbol = new Map((coins ?? []).filter((c) => c.market_cap != null).map((c) => [c.symbol, Number(c.market_cap)]));

  const barsBySymbol = new Map<string, { ts: string; close: number | null }[]>();
  const metaBySymbol = new Map<string, { assetType: string; volume: number | null; asOf: string | null }>();

  for (const row of (barRows ?? []) as { symbol: string; asset_type: string; ts: string; close: number | null; volume: number | null }[]) {
    const arr = barsBySymbol.get(row.symbol) ?? [];
    arr.push({ ts: row.ts, close: row.close });
    barsBySymbol.set(row.symbol, arr);
    const meta = metaBySymbol.get(row.symbol);
    // recent_prices returns newest-first per symbol, so the first row seen is
    // the newest one.
    if (!meta) metaBySymbol.set(row.symbol, { assetType: row.asset_type, volume: row.volume, asOf: row.ts });
  }
  // Chart series want oldest-first.
  for (const arr of barsBySymbol.values()) arr.sort((a, b) => (a.ts < b.ts ? -1 : 1));

  // Crypto's headline change is CoinGecko's rolling 24h everywhere else in the
  // app; deriving it from two daily closes here made BTC read differently on
  // Compare than on its own ticker page.
  const cryptoSymbols = symbols.filter((s) => metaBySymbol.get(s)?.assetType === "crypto");
  const rolling = await cryptoRolling24hFor(cryptoSymbols);

  return symbols
    .map((symbol) => {
      const symbolBars = barsBySymbol.get(symbol) ?? [];
      const price = symbolBars.length > 0 ? symbolBars[symbolBars.length - 1].close : null;
      const prev = symbolBars.length > 1 ? symbolBars[symbolBars.length - 2].close : null;
      const f = fundamentalsBySymbol.get(symbol);
      const meta = metaBySymbol.get(symbol);
      const closeToClose = price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null;

      return {
        symbol,
        assetType: directoryBySymbol.get(symbol)?.asset_type ?? meta?.assetType ?? "equity",
        name: directoryBySymbol.get(symbol)?.name ?? null,
        price,
        changePct: rolling.get(symbol) ?? closeToClose,
        marketCap: capBySymbol.get(symbol) ?? (price !== null && f?.shares_outstanding ? price * f.shares_outstanding : null),
        pe: price !== null && f?.eps_ttm && f.eps_ttm > 0 ? price / f.eps_ttm : null,
        dividendYield: price !== null && price > 0 && f?.dividends_ttm ? (f.dividends_ttm / price) * 100 : null,
        volume: meta?.volume ?? null,
        asOf: meta?.asOf ?? null,
        bars: symbolBars,
      };
    })
    .filter((row) => row.bars.length > 0);
}
