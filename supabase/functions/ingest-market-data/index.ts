// Scheduled Edge Function: backfills/updates historical_prices (daily OHLCV)
// for every symbol listed in each enabled market_data provider's config.
// Separate concern from live quotes - this feeds Phase 4's pattern matching,
// not the dashboard's real-time price display.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { fetchYahooFinanceDaily, type PriceBar } from "../_shared/market-adapters.ts";
import { buildDirectoryPatch } from "../_shared/symbol-directory.ts";


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

const VALID_ASSET_TYPES = ["equity", "etf", "crypto", "forex", "index", "future"] as const;

// Symbols ingested on demand join this job's set, so a symbol someone searched
// for last week is still current this week. Bounded three ways: only symbols
// requested inside DEMAND_WINDOW_DAYS, at most MAX_ON_DEMAND_SYMBOLS of them
// (stalest first), and paced by REQUEST_DELAY_MS like every other call here.
// Without the pacing this loop was ~500 sequential unthrottled requests
// against a feed that publishes no quota - the same "broken and quiet" shape
// as the cron bug it was meant to fix.
const DEMAND_WINDOW_DAYS = 30;
const MAX_ON_DEMAND_SYMBOLS = 150;
const REQUEST_DELAY_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A symbol with less stored history than this is fetched at full depth
// ("max"); anything deeper only needs the routine 2y refresh. Same figure as
// TARGET_FACTOR_HISTORY_BARS in src/lib/ai/factors.ts (Deno cannot import it).
const DEEPEN_BELOW_BARS = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storedBarCount(supabase: any, symbol: string): Promise<number | null> {
  const { count, error } = await supabase
    .from("historical_prices")
    .select("*", { count: "exact", head: true })
    .eq("symbol", symbol);
  return error ? null : (count ?? 0);
}

/** "max" for a first fetch or a short series, the routine window otherwise. */
function refreshRange(stored: number | null): string {
  return stored === null || stored < DEEPEN_BELOW_BARS ? "max" : "2y";
}

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
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

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

  // What the configured provider rows already cover, so a symbol is not
  // fetched twice in one run.
  const configured = new Set<string>();
  for (const provider of providers ?? []) {
    const providerAssetType = (provider.config?.asset_type as PriceBar["asset_type"]) ?? "equity";
    for (const { symbol } of readSymbols(provider.config, providerAssetType)) configured.add(symbol.toUpperCase());
  }

  for (const provider of providers ?? []) {
    const adapterName = String(provider.config?.adapter ?? "");
    const providerAssetType = (provider.config?.asset_type as PriceBar["asset_type"]) ?? "equity";
    const symbols = readSymbols(provider.config, providerAssetType);

    if (adapterName !== "yahoo_finance_chart") {
      results.push({ provider: provider.name, error: `unknown adapter "${adapterName}"` });
      continue;
    }

    for (const { symbol, assetType } of symbols) {
      const now = new Date().toISOString();
      try {
        await sleep(REQUEST_DELAY_MS);
        const before = await storedBarCount(supabase, symbol.toUpperCase());
        const bars = await fetchYahooFinanceDaily(symbol, assetType, refreshRange(before));
        if (bars.length === 0) {
          results.push({ provider: provider.name, symbol, error: "no data returned" });
          await supabase
            .from("symbol_directory")
            .update(buildDirectoryPatch({ kind: "no_data" }, now))
            .eq("symbol", symbol);
          continue;
        }

        const { error: upsertError } = await supabase
          .from("historical_prices")
          .upsert(bars, { onConflict: "symbol,ts", ignoreDuplicates: false });
        // What is stored, not what this call fetched: a 2y refresh of a
        // 30-year series used to write bars=~505 back, which made the
        // analysis path think the symbol was shallow and re-fetch it.
        const storedAfter = (await storedBarCount(supabase, symbol.toUpperCase())) ?? bars.length;

        // Every configured symbol gets its directory row bumped here -
        // previously only the on-demand pass below did this, so this loop's
        // 40-plus tracked equities/ETFs kept refreshing historical_prices
        // while /admin's staleness check (and the Holdings-table fallback
        // that reads it) kept reporting them as untouched for days.
        await supabase
          .from("symbol_directory")
          .update(
            buildDirectoryPatch(
              upsertError
                ? { kind: "error", message: upsertError.message }
                : { kind: "success", bars: storedAfter },
              now,
            ),
          )
          .eq("symbol", symbol);

        results.push({
          provider: provider.name,
          symbol,
          asset_type: assetType,
          bars: bars.length,
          error: upsertError?.message,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ provider: provider.name, symbol, error: message });
        await supabase
          .from("symbol_directory")
          .update(buildDirectoryPatch({ kind: "error", message }, now))
          .eq("symbol", symbol);
      }
    }
  }

  // Second pass: on-demand symbols, refreshed by demand and staleness.
  const since = new Date(Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: onDemand } = await supabase
    .from("symbol_directory")
    .select("symbol, asset_type, last_success_at")
    .eq("status", "available")
    .gte("last_requested_at", since)
    // Crypto history comes from ingest-crypto's CoinGecko pass, not this one.
    .neq("asset_type", "crypto")
    .order("last_success_at", { ascending: true, nullsFirst: true })
    .limit(MAX_ON_DEMAND_SYMBOLS);

  for (const row of onDemand ?? []) {
    const symbol = row.symbol.toUpperCase();
    if (configured.has(symbol)) continue;
    try {
      await sleep(REQUEST_DELAY_MS);
      // Storage symbols drop the provider's suffix (BTC-USD -> BTC); forex and
      // indices keep theirs, so re-derive the provider form here.
      const providerSymbol = row.asset_type === "forex" ? `${symbol}=X` : symbol;
      const before = await storedBarCount(supabase, symbol);
      const bars = await fetchYahooFinanceDaily(providerSymbol, row.asset_type as PriceBar["asset_type"], refreshRange(before));
      if (bars.length === 0) {
        results.push({ provider: "on_demand", symbol, error: "no data returned" });
        continue;
      }
      const { error: upsertError } = await supabase
        .from("historical_prices")
        .upsert(bars.map((b) => ({ ...b, symbol })), { onConflict: "symbol,ts", ignoreDuplicates: false });
      await supabase
        .from("symbol_directory")
        .update({ last_success_at: new Date().toISOString(), last_checked_at: new Date().toISOString(), bars: (await storedBarCount(supabase, symbol)) ?? bars.length })
        .eq("symbol", symbol);
      results.push({ provider: "on_demand", symbol, asset_type: row.asset_type, bars: bars.length, error: upsertError?.message });
    } catch (err) {
      results.push({ provider: "on_demand", symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ results }, { headers: corsHeaders });
});
