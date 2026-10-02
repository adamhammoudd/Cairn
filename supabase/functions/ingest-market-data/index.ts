// Scheduled Edge Function: backfills/updates historical_prices (daily OHLCV)
// for every symbol listed in each enabled market_data provider's config.
// Separate concern from live quotes - this feeds Phase 4's pattern matching,
// not the dashboard's real-time price display.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { fetchYahooFinanceDaily, type PriceBar } from "../_shared/market-adapters.ts";
import { buildDirectoryPatch } from "../_shared/symbol-directory.ts";
import { drainQueue, orderForRefresh, type RefreshCandidate } from "../_shared/refresh-queue.ts";


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
// requested inside DEMAND_WINDOW_DAYS, ordered stalest-first with held/watched
// symbols ahead, drained against RUN_BUDGET_MS, and paced by REQUEST_DELAY_MS.
// Without the pacing this loop was ~500 sequential unthrottled requests
// against a feed that publishes no quota - the same "broken and quiet" shape
// as the cron bug it was meant to fix.
const DEMAND_WINDOW_DAYS = 30;
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

// The run is cut off by the platform's wall-clock limit, so it stops starting
// new symbols after this and reports the rest as skipped. Skipped symbols are
// the freshest ones (the queue is stalest-first), and they head tomorrow's
// queue if they are still the stalest. See _shared/refresh-queue.ts.
const RUN_BUDGET_MS = 100_000;

interface QueueItem extends RefreshCandidate {
  assetType: PriceBar["asset_type"];
  source: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
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

  const results: Record<string, unknown>[] = [];

  // --- Gather every symbol this job is responsible for ---------------------
  const wanted = new Map<string, { assetType: PriceBar["asset_type"]; source: string }>();
  for (const provider of providers ?? []) {
    const adapterName = String(provider.config?.adapter ?? "");
    if (adapterName !== "yahoo_finance_chart") {
      results.push({ provider: provider.name, error: `unknown adapter "${adapterName}"` });
      continue;
    }
    const providerAssetType = (provider.config?.asset_type as PriceBar["asset_type"]) ?? "equity";
    for (const { symbol, assetType } of readSymbols(provider.config, providerAssetType)) {
      wanted.set(symbol.toUpperCase(), { assetType, source: String(provider.name) });
    }
  }

  // Held and watched symbols are refreshed ahead of everything else, whether or
  // not anyone searched for them recently (ISRG was a holding, on no list).
  const prioritySymbols = new Set<string>();
  const holdingTypes = new Map<string, string>();
  for (const table of ["holdings", "watchlist_items"] as const) {
    const cols = table === "holdings" ? "symbol, asset_type" : "symbol";
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select(cols).range(from, from + 999);
      if (error || !data || data.length === 0) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of data as any[]) {
        const s = String(row.symbol).toUpperCase();
        prioritySymbols.add(s);
        if (row.asset_type) holdingTypes.set(s, row.asset_type);
      }
      if (data.length < 1000) break;
    }
  }

  // Directory rows: freshness for ordering, and the on-demand set.
  const since = new Date(Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const directory = new Map<string, { asset_type: string; last_checked_at: string | null; last_success_at: string | null; recent: boolean }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("symbol_directory")
      .select("symbol, asset_type, last_checked_at, last_success_at, last_requested_at, status")
      .in("status", ["available", "error", "rate_limited"])
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      directory.set(String(row.symbol).toUpperCase(), {
        asset_type: row.asset_type,
        last_checked_at: row.last_checked_at,
        last_success_at: row.last_success_at,
        recent: row.last_requested_at >= since,
      });
    }
    if (data.length < 1000) break;
  }
  for (const [symbol, d] of directory) {
    // Crypto history comes from ingest-crypto's CoinGecko pass, not this one.
    if (d.asset_type === "crypto" || wanted.has(symbol)) continue;
    if (d.recent || (prioritySymbols.has(symbol) && d.last_success_at !== null)) {
      wanted.set(symbol, { assetType: d.asset_type as PriceBar["asset_type"], source: "on_demand" });
    }
  }

  const queue = orderForRefresh<QueueItem>(
    [...wanted.entries()].map(([symbol, w]) => ({
      symbol,
      assetType: w.assetType,
      source: w.source,
      lastCheckedAt: directory.get(symbol)?.last_checked_at ?? null,
      lastSuccessAt: directory.get(symbol)?.last_success_at ?? null,
      prioritised: prioritySymbols.has(symbol),
    })),
  );

  // --- Drain it, stalest/held first, against the run budget ----------------
  const drained = await drainQueue(
    queue,
    async ({ symbol, assetType, source }) => {
      const now = new Date().toISOString();
      try {
        await sleep(REQUEST_DELAY_MS);
        const before = await storedBarCount(supabase, symbol);
        // On-demand forex rows are stored without the provider's `=X` suffix.
        const providerSymbol = source === "on_demand" && assetType === "forex" ? `${symbol}=X` : symbol;
        const bars = await fetchYahooFinanceDaily(providerSymbol, assetType, refreshRange(before));
        if (bars.length === 0) {
          results.push({ provider: source, symbol, error: "no data returned" });
          await supabase.from("symbol_directory").update(buildDirectoryPatch({ kind: "no_data" }, now)).eq("symbol", symbol);
          return;
        }

        const { error: upsertError } = await supabase
          .from("historical_prices")
          .upsert(source === "on_demand" ? bars.map((b) => ({ ...b, symbol })) : bars, { onConflict: "symbol,ts", ignoreDuplicates: false });
        // What is stored, not what this call fetched: a 2y refresh of a
        // 30-year series used to write bars=~505 back, which made the
        // analysis path think the symbol was shallow and re-fetch it.
        const storedAfter = (await storedBarCount(supabase, symbol)) ?? bars.length;

        // Every attempt bumps the directory row - success or failure - so
        // /admin's staleness check and the queue order both see what happened.
        await supabase
          .from("symbol_directory")
          .update(
            buildDirectoryPatch(
              upsertError ? { kind: "error", message: upsertError.message } : { kind: "success", bars: storedAfter },
              now,
            ),
          )
          .eq("symbol", symbol);

        results.push({ provider: source, symbol, asset_type: assetType, bars: bars.length, error: upsertError?.message });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ provider: source, symbol, error: message });
        await supabase.from("symbol_directory").update(buildDirectoryPatch({ kind: "error", message }, now)).eq("symbol", symbol);
      }
    },
    startedAt + RUN_BUDGET_MS,
  );

  return Response.json(
    {
      queued: queue.length,
      refreshed: drained.done.length,
      skipped_for_time: drained.skipped.length,
      skipped_symbols: drained.skipped.slice(0, 50).map((s) => s.symbol),
      results,
    },
    { headers: corsHeaders },
  );
});
