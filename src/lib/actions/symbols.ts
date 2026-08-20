"use server";

import { createClient } from "@/lib/supabase/server";
import type { AssetType } from "@/lib/supabase/types";

export interface SymbolSearchResult {
  symbol: string;
  assetType: AssetType;
  name: string | null;
}

// Type-ahead source for "Add Holding" -- pulls from the same market data
// layer (historical_prices) everything else on Markets/Screener reads, so a
// symbol is only selectable here if it's a real, tracked instrument. Crypto
// rows get their display name from crypto_metrics; equities/ETFs don't have
// a names table yet, so they show symbol-only.
export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const supabase = await createClient();

  // Limited by DISTINCT symbol in SQL, not by price row. The previous version
  // selected 200 price rows and de-duplicated in JS, so a symbol with a long
  // history (AAPL: 509 rows) consumed the entire result set and every other
  // match for the same prefix was invisible. Row counts grow daily, so a
  // row-based limit was a bug with a timer on it.
  const { data: prices } = await supabase.rpc("search_symbols", { prefix: q, max_results: 8 });

  const bySymbol = new Map<string, AssetType>();
  for (const p of prices ?? []) {
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, p.asset_type as AssetType);
  }

  const symbols = Array.from(bySymbol.keys());
  if (symbols.length === 0) return [];

  const { data: names } = await supabase.from("crypto_metrics").select("symbol, name").in("symbol", symbols);
  const nameBySymbol = new Map((names ?? []).map((n) => [n.symbol, n.name]));

  return symbols.map((symbol) => ({
    symbol,
    assetType: bySymbol.get(symbol)!,
    name: nameBySymbol.get(symbol) ?? null,
  }));
}
