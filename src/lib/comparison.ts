import type { TimelinePoint } from "@/lib/portfolio";

export const MAX_COMPARE = 4;

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
