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

/**
 * The classification fields Add Holding can fill in for a symbol.
 *
 * Typing a ticker into Add Holding used to leave Sector blank for the user to
 * remember and type by hand - on a field the product already knows the answer
 * to, and one that news relevance reads (see actions/news.ts, which matches
 * headlines against holdings.sector). A blank sector quietly costs the account
 * its sector-matched news.
 *
 * `sector` comes from fundamentals.sector - the same SEC SIC description the
 * sector map groups by - so an autofilled value agrees with the rest of the
 * app rather than introducing a second vocabulary.
 *
 * Geography is deliberately NOT returned. Nothing in the schema carries a
 * country, region or exchange for a symbol, and guessing one from the ticker
 * would put a fabricated field in front of the user on a page whose whole
 * premise is that figures come with a source.
 */
export async function getSymbolProfile(
  symbol: string,
): Promise<{ sector: string | null; assetClass: string | null }> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return { sector: null, assetClass: null };

  const supabase = await createClient();
  const [{ data: fundamentals }, { data: coin }] = await Promise.all([
    supabase.from("fundamentals").select("sector").eq("symbol", normalized).maybeSingle(),
    supabase.from("crypto_metrics").select("symbol").eq("symbol", normalized).maybeSingle(),
  ]);

  // "Digital assets" is the same synthesised name the sector map uses for
  // coins, which carry no SIC classification.
  if (coin) return { sector: "Digital assets", assetClass: "Crypto" };
  return { sector: fundamentals?.sector ?? null, assetClass: null };
}
