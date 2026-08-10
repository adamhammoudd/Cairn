// Scheduled Edge Function: ingests crypto market data from CoinGecko.
//
// Writes three things:
//   1. crypto_metrics      — point-in-time overview (cap, 24h volume, supply)
//   2. historical_prices   — daily closes, asset_type 'crypto'
//   3. historical_events   — derived volatility regimes (see below)
//
// Why (3) exists: Phase 4's engine requires at least one historical analog
// before an analysis passes its completeness gate. For equities those analogs
// are earnings/splits/dividends. Crypto has none of those, so without a
// crypto-native analog source every crypto analysis would be rejected before
// storage. Rather than weakening the gate, we derive analogs from the price
// history we actually ingested: windows where realized volatility was
// unusually high relative to the asset's own baseline. Those are computed
// from real closes — nothing is asserted or invented.
//
// CoinGecko's free tier is keyless but rate-limited (roughly 10-30 req/min),
// so this walks the coin list serially with a delay rather than in parallel.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TOP_N = 25;
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

async function cg<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3${path}`, {
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
function rollingVolatility(closes: number[], window: number): (number | null)[] {
  const returns = closes.map((c, i) => (i === 0 || closes[i - 1] === 0 ? 0 : Math.log(c / closes[i - 1])));
  return closes.map((_, i) => {
    if (i < window) return null;
    const slice = returns.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    return Math.sqrt(variance) * Math.sqrt(365);
  });
}

interface DerivedRegime {
  event_date: string;
  description: string;
  price_before: number;
  price_after: number;
}

/**
 * Flag windows where 30-day realized vol ran materially above the asset's own
 * median. Threshold is relative to the asset itself, not an absolute number —
 * an absolute equity-style threshold would mark essentially all of crypto as
 * "elevated" and carry no information.
 */
function deriveVolatilityRegimes(dates: string[], closes: number[]): DerivedRegime[] {
  const window = 30;
  const vols = rollingVolatility(closes, window);
  const observed = vols.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (observed.length < window) return [];

  const median = observed[Math.floor(observed.length / 2)];

  // Relative-only thresholds break on stablecoins: 1.5x a near-zero median is
  // still near-zero, which manufactured "elevated volatility" analogs for USDT
  // whose price went $1.00 -> $1.00. Feeding those to the analysis engine
  // would yield confident-sounding output about no movement at all. Require
  // the regime to also clear an absolute floor to count as one.
  const MIN_ANNUALIZED_VOL = 0.15;
  const threshold = Math.max(median * 1.5, MIN_ANNUALIZED_VOL);

  const regimes: DerivedRegime[] = [];
  let inRegime = false;
  let startIdx = 0;

  for (let i = 0; i < vols.length; i++) {
    const v = vols[i];
    if (v === null) continue;

    if (!inRegime && v > threshold) {
      inRegime = true;
      startIdx = i;
    } else if (inRegime && v <= threshold) {
      inRegime = false;
      // Only keep regimes that persisted — a single day over the line is noise.
      if (i - startIdx >= 5) {
        regimes.push({
          event_date: dates[startIdx],
          description:
            `Elevated volatility regime: 30-day realized volatility exceeded ` +
            `${(threshold * 100).toFixed(0)}% annualized (1.5x this asset's own median) ` +
            `for ${i - startIdx} days.`,
          price_before: closes[startIdx],
          price_after: closes[i],
        });
      }
    }
  }

  // Keep the most recent handful — older regimes add little for pattern matching.
  return regimes.slice(-8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const coins = await cg<MarketCoin[]>(
    `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${TOP_N}&page=1`,
  );
  if (!coins || !Array.isArray(coins)) {
    return Response.json({ error: "CoinGecko markets request failed" }, { status: 502, headers: corsHeaders });
  }

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

  // Pick the stalest coins for the history pass. Without this, a rate-limited
  // run always burns its budget on the same top-ranked coins and the rest
  // never get history at all.
  const { data: existing } = await supabase
    .from("historical_prices")
    .select("symbol, ts")
    .eq("asset_type", "crypto")
    .order("ts", { ascending: false });

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

    const regimes = deriveVolatilityRegimes(dates, closes);
    // Replace this symbol's derived regimes rather than accumulating duplicates
    // across runs — they're recomputed from the full window each time.
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
