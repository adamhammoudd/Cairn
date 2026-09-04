// Scheduled Edge Function: ingests crypto market data from CoinGecko.
//
// Writes three things:
//   1. crypto_metrics      - point-in-time overview (cap, 24h volume, supply)
//   2. historical_prices   - daily closes, asset_type 'crypto'
//   3. historical_events   - derived volatility regimes (see below)
//
// Why (3) exists: Phase 4's engine requires at least one historical analog
// before an analysis passes its completeness gate. For equities those analogs
// are earnings/splits/dividends. Crypto has none of those, so without a
// crypto-native analog source every crypto analysis would be rejected before
// storage. Rather than weakening the gate, we derive analogs from the price
// history we actually ingested: windows where realized volatility was
// unusually high relative to the asset's own baseline. Those are computed
// from real closes - nothing is asserted or invented.
//
// CoinGecko's free tier is keyless but rate-limited (roughly 10-30 req/min),
// so this walks the coin list serially with a delay rather than in parallel.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { deriveVolatilityRegimes, CRYPTO_PERIODS_PER_YEAR } from "../_shared/volatility.ts";
import { buildDirectoryPatch } from "../_shared/symbol-directory.ts";

// Was a hardcoded 25 - a self-imposed cap on a keyless API, not a provider
// limit. It is now the provider row's `config.top_n` (default 250, CoinGecko's
// max page size), and coins ingested on demand are refreshed alongside it
// however they rank, so the cron set follows what people actually look at.
const DEFAULT_TOP_N = 250;
const COINGECKO_MAX_PAGE_SIZE = 250;
const HISTORY_DAYS = 365;
// CoinGecko's free tier starts refusing after roughly three history calls in
// quick succession, so pace hard and take only a few coins per run. Successive
// runs pick up whichever coins are stalest, so coverage fills in over time
// instead of every run retrying the same first few and starving the rest.
const REQUEST_DELAY_MS = 12_000;
const HISTORY_COINS_PER_RUN = 4;

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  max_supply: number | null;
  price_change_percentage_24h: number | null;
  market_cap_rank: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cg<T>(baseUrl: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "cairn-ingest/1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Realized volatility over a rolling window, annualized with sqrt(365) rather
 * than sqrt(252): crypto trades every day, so the equity trading-day
 * convention would understate it by ~20%.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Base URL and enabled flag come from data_providers rather than being
  // hardcoded, so this source can be disabled or repointed without a code
  // deploy, same as every other ingestion function (see seed/providers.sql).
  const { data: provider, error: providerError } = await supabase
    .from("data_providers")
    .select("endpoint, enabled")
    .eq("provider_type", "market_data")
    .contains("config", { adapter: "coingecko" })
    .maybeSingle();

  if (providerError) {
    return Response.json({ error: providerError.message }, { status: 500, headers: corsHeaders });
  }
  if (!provider || !provider.enabled) {
    return Response.json({ skipped: "CoinGecko provider missing or disabled in data_providers" }, { headers: corsHeaders });
  }
  const baseUrl = provider.endpoint;

  const configuredTopN = Number((provider.config as Record<string, unknown> | null)?.top_n ?? DEFAULT_TOP_N);
  const topN = Number.isFinite(configuredTopN) && configuredTopN > 0 ? Math.floor(configuredTopN) : DEFAULT_TOP_N;

  const coins: MarketCoin[] = [];
  const pages = Math.ceil(topN / COINGECKO_MAX_PAGE_SIZE);
  for (let page = 1; page <= pages; page++) {
    const perPage = Math.min(COINGECKO_MAX_PAGE_SIZE, topN - coins.length);
    if (perPage <= 0) break;
    const batch = await cg<MarketCoin[]>(
      baseUrl,
      `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}`,
    );
    if (!batch || !Array.isArray(batch)) break;
    coins.push(...batch);
    if (batch.length < perPage) break; // ran out of coins
  }
  if (coins.length === 0) {
    return Response.json({ error: "CoinGecko markets request failed" }, { status: 502, headers: corsHeaders });
  }

  // Coins someone searched for that rank below the top N still need their
  // metrics refreshed, or their 24h change and market cap freeze at whatever
  // the on-demand fetch stored.
  const { data: onDemandCoins } = await supabase
    .from("symbol_directory")
    .select("symbol")
    .eq("asset_type", "crypto")
    .eq("status", "available");

  const covered = new Set(coins.map((c) => c.symbol.toUpperCase()));
  const missing = (onDemandCoins ?? []).map((r) => r.symbol.toUpperCase()).filter((s) => !covered.has(s));
  if (missing.length > 0) {
    // /coins/markets takes ids, not symbols; resolve through the coin list.
    const { data: knownIds } = await supabase.from("crypto_metrics").select("symbol, coingecko_id").in("symbol", missing);
    const ids = (knownIds ?? []).map((r) => r.coingecko_id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = await cg<MarketCoin[]>(
        baseUrl,
        `/coins/markets?vs_currency=usd&ids=${ids.slice(i, i + 50).join(",")}&per_page=50&page=1`,
      );
      if (batch && Array.isArray(batch)) coins.push(...batch);
    }
  }

  // De-duplicated by symbol before it feeds anything downstream. A shared
  // ticker across two different CoinGecko listings is a real, common event in
  // crypto (FIGR_HELOC, GRAM, RAIN, WBT, LEO and CC are already in
  // symbol_directory for exactly this reason), and coins here comes from two
  // independent fetches - the top-N page and the on-demand "missing" lookup -
  // with nothing stopping the same symbol from arriving via both.
  //
  // Without this, metricsRows can carry two rows with the same conflict key,
  // and `upsert(..., { onConflict: "symbol" })` fails outright:
  //   ON CONFLICT DO UPDATE command cannot affect row a second time
  // which aborted the whole run - metrics, price history and volatility
  // regimes for every coin, not just the colliding pair.
  //
  // The more prominent coin (lower market_cap_rank) wins; unranked coins keep
  // first-seen order, matching how the app resolves other symbol collisions
  // (see the equity/ETF ambiguity note in docs/backlog.md).
  const bySymbol = new Map<string, MarketCoin>();
  for (const c of coins) {
    const sym = c.symbol.toUpperCase();
    const existing = bySymbol.get(sym);
    if (!existing || (c.market_cap_rank ?? Infinity) < (existing.market_cap_rank ?? Infinity)) {
      bySymbol.set(sym, c);
    }
  }
  coins.length = 0;
  coins.push(...bySymbol.values());

  const metricsRows = coins.map((c) => ({
    symbol: c.symbol.toUpperCase(),
    coingecko_id: c.id,
    name: c.name,
    market_cap: c.market_cap,
    total_volume_24h: c.total_volume,
    circulating_supply: c.circulating_supply,
    max_supply: c.max_supply,
    price_change_24h_pct: c.price_change_percentage_24h,
    market_cap_rank: c.market_cap_rank,
    updated_at: new Date().toISOString(),
  }));

  const { error: metricsError } = await supabase
    .from("crypto_metrics")
    .upsert(metricsRows, { onConflict: "symbol" });
  if (metricsError) {
    return Response.json({ error: metricsError.message }, { status: 500, headers: corsHeaders });
  }

  // Bump symbol_directory for every coin this run actually priced - not just
  // the HISTORY_COINS_PER_RUN handful that get a full daily-bar refresh below.
  // /admin's staleness check (and anything reading last_checked_at) cares
  // whether a coin's data was touched at all; the metrics pass touches all of
  // them every run, so that is the real freshness signal, not the slow
  // history queue. (Previously this function never wrote to symbol_directory
  // at all - reads at the top of this file aside - so every crypto row's
  // last_checked_at was stuck at whatever migration 0027's backfill or its
  // first on-demand search left it, BTC included.)
  const nowIso = new Date().toISOString();
  await supabase
    .from("symbol_directory")
    .update(buildDirectoryPatch({ kind: "success" }, nowIso))
    .in("symbol", metricsRows.map((m) => m.symbol));

  // Pick the stalest coins for the history pass. Without this, a rate-limited
  // run always burns its budget on the same top-ranked coins and the rest
  // never get history at all.
  // One bar per coin, per symbol. Reading every crypto row ordered by date and
  // taking the first per symbol gave the right answer only while every coin
  // was inside the row cap; a coin that stopped updating fell out of the window
  // and read as "never ingested".
  const { data: existing } = await supabase.rpc("recent_prices_all", { per_symbol: 1, asset_types: ["crypto"] });

  const freshestBySymbol = new Map<string, string>();
  for (const row of existing ?? []) {
    if (!freshestBySymbol.has(row.symbol)) freshestBySymbol.set(row.symbol, row.ts);
  }

  const historyFor = [...coins]
    .sort((a, b) => {
      const aTs = freshestBySymbol.get(a.symbol.toUpperCase()) ?? "";
      const bTs = freshestBySymbol.get(b.symbol.toUpperCase()) ?? "";
      if (aTs !== bTs) return aTs < bTs ? -1 : 1; // never-ingested ("") first
      return (a.market_cap_rank ?? 999) - (b.market_cap_rank ?? 999);
    })
    .slice(0, HISTORY_COINS_PER_RUN);

  const results = [];

  for (const coin of historyFor) {
    const symbol = coin.symbol.toUpperCase();
    await sleep(REQUEST_DELAY_MS);

    const chart = await cg<{ prices: [number, number][] }>(
      baseUrl,
      `/coins/${coin.id}/market_chart?vs_currency=usd&days=${HISTORY_DAYS}&interval=daily`,
    );
    if (!chart?.prices?.length) {
      results.push({ symbol, error: "no history returned" });
      continue;
    }

    // CoinGecko's daily series ends with a live "now" point that repeats the
    // final calendar date. Postgres rejects an upsert whose payload hits the
    // same (symbol, ts) twice, so collapse to one row per date, keeping the
    // latest observation for that day.
    const closeByDate = new Map<string, number>();
    for (const [ts, price] of chart.prices) {
      closeByDate.set(new Date(ts).toISOString().slice(0, 10), price);
    }

    const dates = Array.from(closeByDate.keys()).sort();
    const closes = dates.map((d) => closeByDate.get(d)!);
    const bars = dates.map((d, i) => ({
      symbol,
      asset_type: "crypto",
      ts: d,
      open: null,
      high: null,
      low: null,
      close: closes[i],
      volume: null,
    }));

    const { error: priceError } = await supabase
      .from("historical_prices")
      .upsert(bars, { onConflict: "symbol,ts", ignoreDuplicates: false });

    const regimes = deriveVolatilityRegimes(dates, closes, CRYPTO_PERIODS_PER_YEAR);
    // Replace this symbol's derived regimes rather than accumulating duplicates
    // across runs - they're recomputed from the full window each time.
    await supabase.from("historical_events").delete().eq("symbol", symbol).eq("event_type", "volatility_regime");

    if (regimes.length > 0) {
      await supabase.from("historical_events").insert(
        regimes.map((r) => ({
          symbol,
          sector: "crypto",
          event_type: "volatility_regime",
          event_date: r.event_date,
          description: r.description,
          price_before: r.price_before,
          price_after: r.price_after,
          metadata: { derived: true, source: "coingecko", method: "30d_realized_vol_vs_own_median" },
        })),
      );
    }

    results.push({ symbol, bars: bars.length, regimes: regimes.length, error: priceError?.message });
  }

  return Response.json(
    { metrics_upserted: metricsRows.length, history: results },
    { headers: corsHeaders },
  );
});
