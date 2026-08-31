"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchIntradaySeries, isMarketDataProviderConfigured } from "@/lib/market-data/provider";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import { RANGES, sessionWindow, windowBars, type IntradayResult, type IntradayView } from "@/lib/intraday-window";
import type { TimelinePoint } from "@/lib/portfolio";

/**
 * A symbol's asset type, needed because Yahoo quotes coins as a `-USD` pair.
 * Read from symbol_directory rather than guessed: `BTC` without it resolves to
 * Grayscale Bitcoin Mini Trust (~$34), which draws a believable chart of
 * entirely the wrong asset.
 */
async function assetTypeOf(symbol: string): Promise<"equity" | "etf" | "crypto" | undefined> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("symbol_directory")
    .select("asset_type")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  const t = data?.asset_type;
  return t === "equity" || t === "etf" || t === "crypto" ? t : undefined;
}

export async function getIntradaySeries(symbol: string, view: IntradayView): Promise<IntradayResult> {
  if (!isMarketDataProviderConfigured()) return { points: [], available: false, stale: false, asOf: null };

  const { interval, outputsize, spanMs } = RANGES[view];
  // Settings > Display > Extended hours. Read on the server rather than passed
  // from the chart so the preference cannot be spoofed from the client into a
  // different provider request.
  const { extendedHours } = await getDisplayPrefs();
  const bars = await fetchIntradaySeries(symbol, interval, outputsize, extendedHours, await assetTypeOf(symbol));
  if (!bars) return { points: [], available: false, stale: false, asOf: null };

  const { points, stale, asOf } = windowBars(bars, view, spanMs);
  return { points, available: points.length > 0, stale, asOf };
}

// Portfolio value over the same intraday grid: each holding is priced on its
// own bars, then carried forward so a symbol that has not printed on a given
// minute still contributes its last known price instead of dropping to zero.
export async function getIntradayPortfolioSeries(view: IntradayView): Promise<IntradayResult> {
  const empty = { points: [] as TimelinePoint[], available: false, stale: false, asOf: null };
  if (!isMarketDataProviderConfigured()) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: holdings } = await supabase.from("holdings").select("symbol, quantity, purchase_date");
  if (!holdings || holdings.length === 0) return { ...empty, available: true };

  const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  // The free tier allows 8 calls a minute; a larger portfolio would burn the
  // quota and rate-limit the rest of the app, so it keeps the daily series.
  if (symbols.length > 8) return empty;

  const assetTypes = new Map<string, "equity" | "etf" | "crypto" | undefined>();
  for (const symbol of symbols) assetTypes.set(symbol, await assetTypeOf(symbol));

  const { interval, outputsize, spanMs } = RANGES[view];
  const { extendedHours } = await getDisplayPrefs();
  const rawBySymbol = new Map<string, { ts: number; close: number }[]>();

  for (const symbol of symbols) {
    const bars = await fetchIntradaySeries(symbol, interval, outputsize, extendedHours, assetTypes.get(symbol));
    if (!bars) return empty;
    rawBySymbol.set(
      symbol,
      bars
        .filter((b) => b.close !== null && Number.isFinite(new Date(b.ts).getTime()))
        .map((b) => ({ ts: new Date(b.ts).getTime(), close: Number(b.close) }))
        .sort((a, b) => a.ts - b.ts),
    );
  }

  const allTs = Array.from(rawBySymbol.values()).flat().map((b) => b.ts);
  if (allTs.length === 0) return { ...empty, available: true };

  // One anchor across every symbol so a closed market shows the last session
  // rather than an empty range, and every symbol lands on the same grid.
  const { keep, stale, asOf } = sessionWindow(allTs, view, spanMs);

  const seriesBySymbol = new Map<string, { ts: number; close: number }[]>();
  for (const [symbol, rows] of rawBySymbol) {
    seriesBySymbol.set(symbol, rows.filter((b) => keep(b.ts)));
  }

  const grid = Array.from(new Set(Array.from(seriesBySymbol.values()).flat().map((b) => b.ts))).sort((a, b) => a - b);
  if (grid.length === 0) return { ...empty, available: true };

  const cursor = new Map<string, number>();

  const points: TimelinePoint[] = grid.map((ts) => {
    let value = 0;
    for (const h of holdings) {
      if (new Date(h.purchase_date).getTime() > ts) continue;
      const rows = seriesBySymbol.get(h.symbol);
      if (!rows || rows.length === 0) continue;

      let i = cursor.get(h.symbol) ?? 0;
      while (i + 1 < rows.length && rows[i + 1].ts <= ts) i++;
      cursor.set(h.symbol, i);
      if (rows[i].ts <= ts) value += rows[i].close * Number(h.quantity);
    }
    return { date: new Date(ts).toISOString(), value };
  });

  return {
    points: points.filter((p) => p.value > 0),
    available: points.some((p) => p.value > 0),
    stale,
    asOf,
  };
}
