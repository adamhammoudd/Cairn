// Scheduled Edge Function: backfills/updates historical_prices (daily OHLCV)
// for every symbol listed in each enabled market_data provider's config.
// Separate concern from live quotes - this feeds Phase 4's pattern matching,
// not the dashboard's real-time price display.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchYahooFinanceDaily, type PriceBar } from "../_shared/market-adapters.ts";


// asset_type used to be read once per provider and applied to every symbol
// under it, so all seven tracked symbols were written as "equity" -- SPY
// included. The Markets page filters on this column, which is why its ETF,
// Forex and Indices tabs were permanently empty while an ETF sat in the
// equity list.
//
// config.symbols now accepts either form:
//   ["AAPL", "MSFT"]                              -- inherit config.asset_type
//   [{ "symbol": "SPY", "asset_type": "etf" }]    -- per-symbol override
// The plain-string form is kept so existing provider rows keep working
// unchanged; only the symbols that need a different type have to be rewritten.
interface TrackedSymbol {
  symbol: string;
  assetType: PriceBar["asset_type"];
}

const VALID_ASSET_TYPES = ["equity", "etf", "crypto", "forex", "future"] as const;

function readSymbols(config: Record<string, unknown> | null, fallback: PriceBar["asset_type"]): TrackedSymbol[] {
  const raw = Array.isArray(config?.symbols) ? (config.symbols as unknown[]) : [];
  const out: TrackedSymbol[] = [];

  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push({ symbol: entry, assetType: fallback });
      continue;
    }
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const symbol = typeof obj.symbol === "string" ? obj.symbol : null;
      if (!symbol) continue;
      const declared = typeof obj.asset_type === "string" ? obj.asset_type : null;
      const assetType =
        declared && (VALID_ASSET_TYPES as readonly string[]).includes(declared)
          ? (declared as PriceBar["asset_type"])
          : fallback;
      out.push({ symbol, assetType });
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: providers, error: providersError } = await supabase
    .from("data_providers")
    .select("id, name, config")
    .eq("provider_type", "market_data")
    .eq("enabled", true);

  if (providersError) {
    return Response.json({ error: providersError.message }, { status: 500, headers: corsHeaders });
  }

  const results = [];

  for (const provider of providers ?? []) {
    const adapterName = String(provider.config?.adapter ?? "");
    const providerAssetType = (provider.config?.asset_type as PriceBar["asset_type"]) ?? "equity";
    const symbols = readSymbols(provider.config, providerAssetType);

    if (adapterName !== "yahoo_finance_chart") {
      results.push({ provider: provider.name, error: `unknown adapter "${adapterName}"` });
      continue;
    }

    for (const { symbol, assetType } of symbols) {
      try {
        const bars = await fetchYahooFinanceDaily(symbol, assetType);
        if (bars.length === 0) {
          results.push({ provider: provider.name, symbol, error: "no data returned" });
          continue;
        }

        const { error: upsertError } = await supabase
          .from("historical_prices")
          .upsert(bars, { onConflict: "symbol,ts", ignoreDuplicates: false });

        results.push({
          provider: provider.name,
          symbol,
          asset_type: assetType,
          bars: bars.length,
          error: upsertError?.message,
        });
      } catch (err) {
        results.push({ provider: provider.name, symbol, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return Response.json({ results }, { headers: corsHeaders });
});
