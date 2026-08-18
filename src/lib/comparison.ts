import type { TimelinePoint } from "@/lib/portfolio";

export const MAX_COMPARE = 4;

// One color per compare slot, shared across chips/charts/table so a symbol
// reads as the same series everywhere on the page.
// ui-reset-v2: neutral placeholders, no brand color system in this baseline.
export const COMPARISON_COLORS = ["#666666", "#777777", "#888888", "#999999"];

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
  return row.bars.filter((b): b is { ts: string; close: number } => b.close !== null).map((b) => ({ date: b.ts, value: b.close }));
}
