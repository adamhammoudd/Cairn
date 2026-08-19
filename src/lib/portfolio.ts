import type { ChartView, Database } from "@/lib/supabase/types";

export type Holding = Database["public"]["Tables"]["holdings"]["Row"];
export type PriceBar = Database["public"]["Tables"]["historical_prices"]["Row"];

export interface HoldingMetrics extends Holding {
  currentPrice: number | null;
  value: number | null;
  gain: number | null;
  gainPct: number | null;
}

// Latest close (and prior close, for day-change) per symbol, from a bag of
// historical_prices rows already filtered to the symbols we care about.
export function latestCloseBySymbol(prices: PriceBar[]) {
  const bySymbol = new Map<string, PriceBar[]>();
  for (const p of prices) {
    const arr = bySymbol.get(p.symbol) ?? [];
    arr.push(p);
    bySymbol.set(p.symbol, arr);
  }

  const result = new Map<string, { latest: number | null; prev: number | null }>();
  for (const [symbol, rows] of bySymbol) {
    rows.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // descending
    result.set(symbol, {
      latest: rows[0]?.close == null ? null : Number(rows[0].close),
      prev: rows[1]?.close == null ? null : Number(rows[1].close),
    });
  }
  return result;
}

export function computeHoldingMetrics(
  holdings: Holding[],
  closes: Map<string, { latest: number | null; prev: number | null }>,
): HoldingMetrics[] {
  return holdings.map((h) => {
    const currentPrice = closes.get(h.symbol)?.latest ?? null;
    const value = currentPrice !== null ? currentPrice * h.quantity : null;
    const costBasis = h.purchase_price * h.quantity;
    const gain = value !== null ? value - costBasis : null;
    const gainPct = value !== null && costBasis !== 0 ? (gain! / costBasis) * 100 : null;
    return { ...h, currentPrice, value, gain, gainPct };
  });
}

export interface PortfolioTotals {
  totalValue: number;
  totalCostBasis: number;
  totalGain: number;
  totalGainPct: number;
  todayChangeValue: number;
  todayChangePct: number;
}

export function computeTotals(
  metrics: HoldingMetrics[],
  closes: Map<string, { latest: number | null; prev: number | null }>,
): PortfolioTotals {
  let totalValue = 0;
  let totalCostBasis = 0;
  let prevTotalValue = 0;

  for (const m of metrics) {
    totalCostBasis += m.purchase_price * m.quantity;
    if (m.value !== null) totalValue += m.value;
    const prev = closes.get(m.symbol)?.prev;
    prevTotalValue += (prev ?? m.currentPrice ?? m.purchase_price) * m.quantity;
  }

  const totalGain = totalValue - totalCostBasis;
  const totalGainPct = totalCostBasis !== 0 ? (totalGain / totalCostBasis) * 100 : 0;
  const todayChangeValue = totalValue - prevTotalValue;
  const todayChangePct = prevTotalValue !== 0 ? (todayChangeValue / prevTotalValue) * 100 : 0;

  return { totalValue, totalCostBasis, totalGain, totalGainPct, todayChangeValue, todayChangePct };
}

export interface AllocationSlice {
  label: string;
  value: number;
  pct: number;
}

export function computeAllocation(
  metrics: HoldingMetrics[],
  groupBy: "asset_class" | "sector" | "geography" | "asset_type",
): AllocationSlice[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const m of metrics) {
    const value = m.value ?? m.purchase_price * m.quantity;
    const key = (m[groupBy] as string | null) || "Unclassified";
    totals.set(key, (totals.get(key) ?? 0) + value);
    grandTotal += value;
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value, pct: grandTotal !== 0 ? (value / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface TimelinePoint {
  date: string;
  value: number;
}

const RANGE_DAYS: Record<Exclude<ChartView, "1D">, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  ALL: Infinity,
};

// Builds a portfolio-value-over-time series honoring each holding's own
// purchase_date (not counted before it was bought) using daily close prices
// with last-known-value carry-forward across non-trading days.
export function computeTimelineSeries(holdings: Holding[], prices: PriceBar[], timeframe: ChartView): TimelinePoint[] {
  if (holdings.length === 0) return [];

  const bySymbol = new Map<string, PriceBar[]>();
  for (const p of prices) {
    const arr = bySymbol.get(p.symbol) ?? [];
    arr.push(p);
    bySymbol.set(p.symbol, arr);
  }
  for (const arr of bySymbol.values()) arr.sort((a, b) => (a.ts < b.ts ? -1 : 1)); // ascending

  const allDates = Array.from(new Set(prices.map((p) => p.ts))).sort();
  if (allDates.length === 0) return [];

  const today = allDates[allDates.length - 1];
  let dates = allDates;
  if (timeframe !== "ALL" && timeframe !== "1D") {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - RANGE_DAYS[timeframe]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    dates = allDates.filter((d) => d >= cutoffStr);
  }
  if (timeframe === "1D") {
    dates = allDates.slice(-2); // no intraday feed yet — most recent two closes only
  }

  const cursor = new Map<string, number>(); // symbol -> pointer into its price array

  return dates
    .map((date) => {
      let value = 0;
      let anyActive = false;

      for (const h of holdings) {
        if (h.purchase_date > date) continue;
        const rows = bySymbol.get(h.symbol);
        if (!rows || rows.length === 0) continue;

        let i = cursor.get(h.symbol) ?? 0;
        while (i + 1 < rows.length && rows[i + 1].ts <= date) i++;
        cursor.set(h.symbol, i);

        if (rows[i].ts <= date && rows[i].close !== null) {
          value += Number(rows[i].close) * h.quantity;
          anyActive = true;
        }
      }

      return anyActive ? { date, value } : null;
    })
    .filter((p): p is TimelinePoint => p !== null);
}

// Picks an XAxis `interval` (points to skip between labels) so labels never
// overlap regardless of series length, plus a tick label format matched to
// the selected timeframe's granularity.
export function xAxisConfig(points: TimelinePoint[], timeframe: ChartView) {
  const desiredTicks = 6;
  const interval = points.length > desiredTicks ? Math.ceil(points.length / desiredTicks) - 1 : 0;

  // 1D/1W points carry a time component when an intraday feed is available;
  // formatting them as dates would print the same label on every tick.
  const formatters: Record<ChartView, (iso: string) => string> = {
    "1D": (iso) =>
      iso.length > 10
        ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    "1W": (iso) =>
      iso.length > 10
        ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric" })
        : new Date(iso).toLocaleDateString(undefined, { weekday: "short" }),
    "1M": (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    "3M": (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    "1Y": (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short" }),
    ALL: (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
  };

  return { interval, tickFormatter: formatters[timeframe] };
}
