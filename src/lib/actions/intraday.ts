"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchIntradaySeries, isMarketDataProviderConfigured } from "@/lib/market-data/provider";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import type { TimelinePoint } from "@/lib/portfolio";

// 1D and 1W are the only ranges where a daily-close series is visibly wrong -
// one or five points instead of a curve. Both are served straight from the
// provider rather than the daily `historical_prices` store, so the shape of
// the data matches the label on the button.
const RANGES = {
  "1D": { interval: "1min" as const, outputsize: 400, spanMs: 24 * 60 * 60 * 1000 },
  "1W": { interval: "15min" as const, outputsize: 700, spanMs: 7 * 24 * 60 * 60 * 1000 },
};

export type IntradayView = keyof typeof RANGES;

export interface IntradayResult {
  points: TimelinePoint[];
  /** False when no market-data key is configured, so the UI can say why. */
  available: boolean;
}

function withinSpan(ts: string, spanMs: number): boolean {
  const t = new Date(ts).getTime();
  return Number.isFinite(t) && Date.now() - t <= spanMs;
}

export async function getIntradaySeries(symbol: string, view: IntradayView): Promise<IntradayResult> {
  if (!isMarketDataProviderConfigured()) return { points: [], available: false };

  const { interval, outputsize, spanMs } = RANGES[view];
  // Settings > Display > Extended hours. Read on the server rather than passed
  // from the chart so the preference cannot be spoofed from the client into a
  // different provider request.
  const { extendedHours } = await getDisplayPrefs();
  const bars = await fetchIntradaySeries(symbol, interval, outputsize, extendedHours);
  if (!bars) return { points: [], available: false };

  return {
    points: bars
      .filter((b) => b.close !== null && withinSpan(b.ts, spanMs))
      .map((b) => ({ date: b.ts, value: Number(b.close) })),
    available: true,
  };
}

// Portfolio value over the same intraday grid: each holding is priced on its
// own bars, then carried forward so a symbol that has not printed on a given
// minute still contributes its last known price instead of dropping to zero.
export async function getIntradayPortfolioSeries(view: IntradayView): Promise<IntradayResult> {
  if (!isMarketDataProviderConfigured()) return { points: [], available: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { points: [], available: false };

  const { data: holdings } = await supabase.from("holdings").select("symbol, quantity, purchase_date");
  if (!holdings || holdings.length === 0) return { points: [], available: true };

  const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  // The free tier allows 8 calls a minute; a larger portfolio would burn the
  // quota and rate-limit the rest of the app, so it keeps the daily series.
  if (symbols.length > 8) return { points: [], available: false };

  const { interval, outputsize, spanMs } = RANGES[view];
  const { extendedHours } = await getDisplayPrefs();
  const seriesBySymbol = new Map<string, { ts: number; close: number }[]>();

  for (const symbol of symbols) {
    const bars = await fetchIntradaySeries(symbol, interval, outputsize, extendedHours);
    if (!bars) return { points: [], available: false };
    seriesBySymbol.set(
      symbol,
      bars
        .filter((b) => b.close !== null && withinSpan(b.ts, spanMs))
        .map((b) => ({ ts: new Date(b.ts).getTime(), close: Number(b.close) }))
        .sort((a, b) => a.ts - b.ts),
    );
  }

  const grid = Array.from(new Set(Array.from(seriesBySymbol.values()).flat().map((b) => b.ts))).sort((a, b) => a - b);
  if (grid.length === 0) return { points: [], available: true };

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

  return { points: points.filter((p) => p.value > 0), available: true };
}
