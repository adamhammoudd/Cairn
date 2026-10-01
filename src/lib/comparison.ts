import type { TimelinePoint } from "@/lib/portfolio";
import type { ChartView } from "@/lib/supabase/types";
import { buildPriceSeries } from "@/lib/ticker";

export const MAX_COMPARE = 4;

// One color per compare slot, shared across chips/charts/table so a symbol
// reads as the same series everywhere on the page. Pulled straight from the
// design token set (accent, info, warning, violet) -- no new hex values.
export const COMPARISON_COLORS = ["#2FC685", "#5B8DEF", "#D9A441", "#9B8CE0"];

export interface ComparisonRow {
  symbol: string;
  assetType: string;
  /** Provider display name, from symbol_directory. */
  name: string | null;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
  volume: number | null;
  /** Date of the newest bar for this symbol, YYYY-MM-DD. */
  asOf: string | null;
  bars: { ts: string; close: number | null }[];
  /** Quote currency of price and market cap, never converted. Null = unknown. */
  currency: string | null;
}

// The summary card's sparkline. It takes the timeframe because it sits under a
// label reading "Indexed · 3M" and used to plot every bar the row carried -
// the full 400-day history - regardless of which timeframe was selected. The
// card and the chart below it were drawing different windows of the same
// series, and only the chart's matched its label.
export function seriesFor(row: ComparisonRow, timeframe: ChartView): TimelinePoint[] {
  // `close` is a Postgres numeric - a string over PostgREST. Coerce, or the
  // chart plots only its endpoints.
  return buildPriceSeries(row.bars, timeframe);
}
