"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureSymbolIngested, normalizeSymbol } from "@/lib/market-data/ingest";
import { ensureProfile } from "@/lib/market-data/reference";
import { normalizeSector, SECTOR_LABEL } from "@/lib/sectors";
import { sectorSlugForSic } from "@/lib/sic-sectors";
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
 * Both are free-text columns on `holdings` that a person typed by hand, and
 * migration 0041 exists precisely because two holdings were saved with them
 * blank: ISRG and MSFT fell into "Unclassified" on the allocation chart, and a
 * blank sector also costs the account its sector-matched news (actions/news.ts
 * matches headlines against holdings.sector). Asking someone to remember a
 * company's GICS sector while they are entering a trade is how that happens.
 *
 * Sector is NOT read from `fundamentals.sector`. The two carry different
 * vocabularies: fundamentals holds SEC SIC descriptions like
 * "Services-Prepackaged Software", which is what the sector map groups by,
 * while holdings.sector is GICS-style Title Case ("Technology",
 * "Healthcare"). Writing a SIC string into this field would put a second
 * vocabulary into the allocation chart and split one sector across two slices.
 *
 * Values are normalised to the convention already in the table (see 0041:
 * NVDA/AMZN store "Technology" / "Equity"), because the allocation chart
 * groups by exact string.
 *
 * There is no geography here. That field was removed from the product: no
 * table carries a country for a symbol, so it could only ever be typed by
 * hand, and mostly wasn't.
 */

const ASSET_CLASS_LABEL: Record<AssetType, string> = {
  equity: "Equity",
  etf: "ETF",
  crypto: "Crypto",
  forex: "Forex",
  index: "Index",
  future: "Future",
};

export async function getSymbolProfile(
  symbol: string,
  assetType: AssetType,
): Promise<{ sector: string | null; assetClass: string | null }> {
  const assetClass = ASSET_CLASS_LABEL[assetType] ?? null;
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return { sector: null, assetClass };

  // A coin has no country of incorporation and no assetProfile to fetch. It
  // does have a sector in this app's own vocabulary, so that is filled and
  // geography is left alone rather than invented as "Global".
  if (assetType === "crypto") {
    return { sector: SECTOR_LABEL.crypto ?? "Crypto", assetClass };
  }

  // Two sources, best first.
  //
  // symbol_profiles (Yahoo assetProfile) carries a GICS-style sector AND a
  // country, which is everything this needs - but the table is empty in this
  // deployment: the quoteSummary endpoint it reads now requires a crumb and
  // returns nothing, so ensureProfile writes no row. It is still tried first,
  // so this starts working on its own the day that fetch is fixed.
  const profile = await ensureProfile(normalized).catch(() => null);
  const profileSlug = normalizeSector(profile?.sector);
  if (profileSlug) {
    return { sector: SECTOR_LABEL[profileSlug] ?? null, assetClass };
  }

  // Fallback: the SEC SIC code already stored on `fundamentals`, mapped onto
  // this app's sector vocabulary. The SIC *description* cannot be used
  // directly - "Services-Prepackaged Software" matches no alias in
  // lib/sectors.ts and would draw its own wedge on the allocation chart
  // beside "Technology" - so the mapping is on the numeric code, which is the
  // stable key. See lib/sic-sectors.ts.
  //
  // There is no geography here: `fundamentals` stores no country, and the SEC
  // filer address that would supply one is not ingested. Left null rather
  // than guessed from the ticker.
  const supabase = await createClient();
  const { data: fundamentals } = await supabase
    .from("fundamentals")
    .select("sic")
    .eq("symbol", normalized)
    .maybeSingle();
  const sicSlug = sectorSlugForSic(fundamentals?.sic);

  return { sector: sicSlug ? (SECTOR_LABEL[sicSlug] ?? null) : null, assetClass };
}
