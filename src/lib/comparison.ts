import type { TimelinePoint } from "@/lib/portfolio";

export const MAX_COMPARE = 4;

// One color per compare slot, shared across chips/charts/table so a symbol
// reads as the same series everywhere on the page. Pulled straight from the
// design token set (accent, info, warning, violet) -- no new hex values.
export const COMPARISON_COLORS = ["#2FC685", "#5B8DEF", "#D9A441", "#9B8CE0"];

export interface ComparisonRow {
  symbol: string;
  assetType: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
  volume: number | null;
  bars: { ts: string; close: number | null }[];
}

export function seriesFor(row: ComparisonRow): TimelinePoint[] {
  // `close` is a Postgres numeric - a string over PostgREST. Coerce, or the
  // chart plots only its endpoints.
  return row.bars
    .filter((b): b is { ts: string; close: number } => b.close !== null)
    .map((b) => ({ date: b.ts, value: Number(b.close) }));
}
