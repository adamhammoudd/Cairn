// Scheduled Edge Function: backfills/updates historical_prices (daily OHLCV)
// for every symbol listed in each enabled market_data provider's config.
// Separate concern from live quotes - this feeds Phase 4's pattern matching,
// not the dashboard's real-time price display.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchYahooFinanceDaily, type PriceBar } from "../_shared/market-adapters.ts";

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
    const symbols = Array.isArray(provider.config?.symbols) ? (provider.config.symbols as string[]) : [];
    const assetType = (provider.config?.asset_type as PriceBar["asset_type"]) ?? "equity";

    if (adapterName !== "yahoo_finance_chart") {
      results.push({ provider: provider.name, error: `unknown adapter "${adapterName}"` });
      continue;
    }

    for (const symbol of symbols) {
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
