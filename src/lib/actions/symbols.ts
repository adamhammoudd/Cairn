"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureSymbolIngested, normalizeSymbol } from "@/lib/market-data/ingest";
import type { AssetType } from "@/lib/supabase/types";

export interface SymbolSearchResult {
  symbol: string;
  assetType: AssetType;
  name: string | null;
  /**
   * `tracked`   already in the price store, selectable immediately
   * `available` not stored yet, but the provider has it -- selecting it ingests
   * `unavailable` the provider has no data for it (delisted, typo, uncovered)
   */
  availability?: "tracked" | "available" | "unavailable";
  /** Why an `unavailable` result is unavailable, in the provider's words. */
  detail?: string | null;
}

// Type-ahead source for Add Holding, Alerts, Compare, the header search and
// the Research scope picker. Reads symbol_directory (one row per symbol, with
// the provider's own display name), so a name search works and the result set
// is limited by symbol rather than by price row.
//
// This is the *local* half of search. It never touches the provider, so it
// stays fast on every keystroke; lookupSymbol() below is the on-demand half.
export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = await createClient();
  const { data } = await supabase.rpc("search_symbols", { prefix: q, max_results: 8 });

  return (data ?? []).map((row) => ({
    symbol: row.symbol,
    assetType: row.asset_type as AssetType,
    name: row.name,
    availability: "tracked" as const,
  }));
}

/**
 * The on-demand half: ask the provider about a symbol the local store does not
 * have, ingest it if it exists, and report honestly if it does not.
 *
 * Called from the type-ahead only when the typed text looks like a ticker and
 * local search produced no exact match, so ordinary typing does not generate
 * outbound requests. Repeat lookups inside the cache window are answered from
 * symbol_directory without touching the provider.
 */
export async function lookupSymbol(query: string): Promise<SymbolSearchResult | null> {
  const symbol = normalizeSymbol(query);
  if (!symbol) return null;

  const result = await ensureSymbolIngested(symbol);
  if (result.status === "available") {
    return {
      symbol: result.symbol,
      assetType: (result.assetType ?? "equity") as AssetType,
      name: result.name,
      availability: result.cached ? "tracked" : "available",
    };
  }

  return {
    symbol: result.symbol,
    assetType: (result.assetType ?? "equity") as AssetType,
    name: result.name,
    availability: "unavailable",
    detail:
      result.status === "rate_limited"
        ? result.selfThrottled
          ? "Too many symbol lookups right now - try again in a few seconds."
          : "The market data provider is rate-limiting Cairn right now - try again shortly."
        : result.status === "error"
          ? `Couldn't reach the market data provider (${result.detail ?? "unknown error"}).`
          : `No market data available for ${result.symbol}.`,
  };
}
