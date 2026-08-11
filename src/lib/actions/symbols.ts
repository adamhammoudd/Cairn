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

  const { data: prices } = await supabase
    .from("historical_prices")
    .select("symbol, asset_type")
    .ilike("symbol", `${q}%`)
    .order("symbol", { ascending: true })
    .limit(200);

  const bySymbol = new Map<string, AssetType>();
  for (const p of prices ?? []) {
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, p.asset_type);
  }

  const symbols = Array.from(bySymbol.keys()).slice(0, 8);
  if (symbols.length === 0) return [];

  const { data: names } = await supabase.from("crypto_metrics").select("symbol, name").in("symbol", symbols);
  const nameBySymbol = new Map((names ?? []).map((n) => [n.symbol, n.name]));

  return symbols.map((symbol) => ({
    symbol,
    assetType: bySymbol.get(symbol)!,
    name: nameBySymbol.get(symbol) ?? null,
  }));
}
