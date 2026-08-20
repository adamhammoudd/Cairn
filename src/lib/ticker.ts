// Single-symbol chart series builder for the ticker detail page. Kept
// separate from computeTimelineSeries in lib/portfolio.ts - that function is
// quantity-weighted across multiple holdings with purchase-date gating; this
// is one symbol's own close price, a simpler shape that would only add
// unused parameters to the portfolio version.

import type { ChartView } from "@/lib/supabase/types";
import type { TimelinePoint } from "@/lib/portfolio";

const RANGE_DAYS: Record<Exclude<ChartView, "1D">, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  ALL: Infinity,
};

export function buildPriceSeries(bars: { ts: string; close: number | null }[], timeframe: ChartView): TimelinePoint[] {
  const sorted = [...bars]
    .filter((b): b is { ts: string; close: number } => b.close !== null)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));
  if (sorted.length === 0) return [];

  let rows = sorted;
  if (timeframe === "1D") {
    rows = sorted.slice(-2); // no intraday feed yet - most recent two closes only
  } else if (timeframe !== "ALL") {
    const today = sorted[sorted.length - 1].ts;
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - RANGE_DAYS[timeframe]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = sorted.filter((b) => b.ts >= cutoffStr);
  }

  // `close` is a Postgres numeric, which PostgREST serialises as a string -
  // charts need real numbers or the series degenerates to its endpoints.
  return rows.map((b) => ({ date: b.ts, value: Number(b.close) }));
}
