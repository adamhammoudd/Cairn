"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchIntradaySeries, isMarketDataProviderConfigured } from "@/lib/market-data/provider";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import {
  closeAtOrBefore,
  composePortfolioSeries,
  RANGES,
  sessionWindow,
  windowBars,
  type IntradayResult,
  type IntradayView,
} from "@/lib/intraday-window";
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

// Portfolio value over the intraday grid. Two things this has to get right, and
// both were previously wrong enough to make the chart not look like the
// portfolio at all:
//   * A held symbol the provider returns no intraday bars for (or that has not
//     printed yet before the equity open) still contributes - carried forward
//     from its last intraday bar, or failing that its latest daily close - so
//     the line is the whole portfolio, not just whichever holdings happened to
//     trade in the window.
//   * One symbol's fetch failing no longer discards the entire series; that
//     holding falls back to its daily close and the rest of the chart stands.
export async function getIntradayPortfolioSeries(view: IntradayView): Promise<IntradayResult> {
  const empty = { points: [] as TimelinePoint[], available: false, stale: false, asOf: null };
  if (!isMarketDataProviderConfigured()) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: holdings } = await supabase
    .from("holdings")
    .select("symbol, quantity, purchase_date")
    .eq("user_id", user.id);
  if (!holdings || holdings.length === 0) return { ...empty, available: true };

  const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  // The free tier allows 8 calls a minute; a larger portfolio would burn the
  // quota and rate-limit the rest of the app, so it keeps the daily series.
  if (symbols.length > 8) return empty;

  // Everything needed before the provider fetch is independent of everything
  // else - one asset-type query for all symbols (was a serial maybeSingle per
  // symbol), the daily closes, and the display prefs, all concurrent.
  const [assetTypeRows, dailyCloseRes, { extendedHours }] = await Promise.all([
    supabase
      .from("symbol_directory")
      .select("symbol, asset_type")
      .in("symbol", symbols.map((s) => s.toUpperCase())),
    supabase.rpc("recent_prices", { symbols, per_symbol: 1 }),
    getDisplayPrefs(),
  ]);

  const assetTypeByUpper = new Map((assetTypeRows.data ?? []).map((r) => [r.symbol, r.asset_type]));
  const assetTypes = new Map<string, "equity" | "etf" | "crypto" | undefined>();
  for (const symbol of symbols) {
    const t = assetTypeByUpper.get(symbol.toUpperCase());
    assetTypes.set(symbol, t === "equity" || t === "etf" || t === "crypto" ? t : undefined);
  }

  // Latest stored daily close per symbol: the price a holding carries before
  // its first intraday print (equities do not trade the overnight and weekend
  // minutes a 24/7 coin does), and its whole contribution when no intraday bar
  // came back at all.
  const dailyClose = new Map<string, number>();
  for (const row of (dailyCloseRes.data ?? []) as { symbol: string; close: number | null }[]) {
    if (row.close != null) dailyClose.set(row.symbol, Number(row.close));
  }

  const { interval, outputsize, spanMs } = RANGES[view];
  const rawBySymbol = new Map<string, { ts: number; close: number }[]>();

  // Fetch every holding's intraday series in parallel rather than awaiting each
  // in turn - up to 8 serial provider round-trips (the `symbols.length > 8`
  // guard above is why 8 is the ceiling) on every intraday chart load. Results
  // are consumed in `symbols` order below, so the composed series stays
  // deterministic.
  const fetched = await Promise.all(
    symbols.map(async (symbol) => ({
      symbol,
      bars: await fetchIntradaySeries(symbol, interval, outputsize, extendedHours, assetTypes.get(symbol)),
    })),
  );

  for (const { symbol, bars } of fetched) {
    // A single symbol's provider failure must not blank the whole chart - it
    // falls back to its daily close below.
    if (!bars) continue;
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
  const gridStart = grid[0];

  // Price to carry for each symbol before its first in-window bar: the last
  // raw bar at or before the window opens, else its daily close.
  const seed = new Map<string, number>();
  for (const symbol of symbols) {
    const price = closeAtOrBefore(rawBySymbol.get(symbol) ?? [], gridStart) ?? dailyClose.get(symbol) ?? null;
    if (price != null) seed.set(symbol, price);
  }

  const lots = holdings.map((h) => ({
    symbol: h.symbol,
    quantity: Number(h.quantity),
    purchaseMs: new Date(h.purchase_date).getTime(),
  }));
  const points = composePortfolioSeries(grid, lots, seriesBySymbol, seed);

  return {
    points: points.filter((p) => p.value > 0),
    available: points.some((p) => p.value > 0),
    stale,
    asOf,
  };
}
