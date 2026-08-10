"use server";

import { createClient } from "@/lib/supabase/server";
import type { ComparisonRow } from "@/lib/comparison";

// The app's tracked-symbol universe lives on data_providers.config.symbols
// (jsonb array on the enabled market_data provider row) — there's no
// separate tickers/assets table. Shared by the Comparison View (symbol
// picker) and the Sector Heat Map (plot universe).
export async function getTrackedSymbols(): Promise<string[]> {
  const supabase = await createClient();
  const { data: providers } = await supabase
    .from("data_providers")
    .select("config")
    .eq("provider_type", "market_data")
    .eq("enabled", true);

  return Array.from(
    new Set(
      (providers ?? []).flatMap((p) => (Array.isArray(p.config?.symbols) ? (p.config.symbols as string[]) : [])),
    ),
  )
    .map((s) => s.toUpperCase())
    .sort();
}

// Derives marketCap/pe/dividendYield the same way runScreen() and
// ticker-workspace.tsx already do independently — accepted small
// duplication, the formula is already computed in three places in this
// codebase.
export async function getComparisonData(symbols: string[]): Promise<ComparisonRow[]> {
  if (symbols.length === 0) return [];
  const supabase = await createClient();

  const [{ data: bars }, { data: fundamentals }] = await Promise.all([
    supabase
      .from("historical_prices")
      .select("symbol, asset_type, ts, close, volume")
      .in("symbol", symbols)
      .order("ts", { ascending: true })
      .limit(400 * symbols.length),
    supabase.from("fundamentals").select("symbol, shares_outstanding, eps_ttm, dividends_ttm").in("symbol", symbols),
  ]);

  const fundamentalsBySymbol = new Map((fundamentals ?? []).map((f) => [f.symbol, f]));
  const barsBySymbol = new Map<string, { ts: string; close: number | null }[]>();
  const metaBySymbol = new Map<string, { assetType: string; volume: number | null }>();

  for (const b of bars ?? []) {
    const arr = barsBySymbol.get(b.symbol) ?? [];
    arr.push({ ts: b.ts, close: b.close });
    barsBySymbol.set(b.symbol, arr);
    metaBySymbol.set(b.symbol, { assetType: b.asset_type, volume: b.volume });
  }

  return symbols
    .map((symbol) => {
      const symbolBars = barsBySymbol.get(symbol) ?? [];
      const price = symbolBars.length > 0 ? symbolBars[symbolBars.length - 1].close : null;
      const prev = symbolBars.length > 1 ? symbolBars[symbolBars.length - 2].close : null;
      const f = fundamentalsBySymbol.get(symbol);

      return {
        symbol,
        assetType: metaBySymbol.get(symbol)?.assetType ?? "equity",
        price,
        changePct: price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null,
        marketCap: price !== null && f?.shares_outstanding ? price * f.shares_outstanding : null,
        pe: price !== null && f?.eps_ttm && f.eps_ttm > 0 ? price / f.eps_ttm : null,
        dividendYield: price !== null && price > 0 && f?.dividends_ttm ? (f.dividends_ttm / price) * 100 : null,
        volume: metaBySymbol.get(symbol)?.volume ?? null,
        bars: symbolBars,
      };
    })
    .filter((row) => row.bars.length > 0);
}
