import type { ChartView, Database } from "@/lib/supabase/types";
import { formatChartLabel, isInstant } from "@/lib/chart-dates";

/**
 * Holdings-table quantity display. Rounding a fractional crypto quantity to
 * 4 decimal places (fine for a share count) throws away real precision: a
 * 0.000544 BTC holding rendered as "0.0005" is off by ~8% from the row's own
 * (correctly, full-precision computed) value column - exactly the "BTC
 * doesn't reconcile" gap from the 2026-09-05 review. quantity * price is
 * still computed from the untruncated number everywhere (this only touches
 * what's printed), so this closes the gap between what a reader can
 * literally verify with a calculator and what the app already computed.
 */
export function formatQuantity(quantity: number): string {
  const digits = Math.abs(quantity) < 1 ? 8 : 4;
  return quantity.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export type Holding = Database["public"]["Tables"]["holdings"]["Row"];
export type PriceBar = Database["public"]["Tables"]["historical_prices"]["Row"];

export interface HoldingMetrics extends Holding {
  currentPrice: number | null;
  value: number | null;
  gain: number | null;
  gainPct: number | null;
  /** True when currentPrice fell back to a stale stored close - see getLatestCloses(). */
  priceStale: boolean;
  /** Date currentPrice is as of (bar date, or the live quote's own date). */
  priceAsOf: string | null;
}

export function computeHoldingMetrics(
  holdings: Holding[],
  closes: Map<string, { latest: number | null; prev: number | null; stale?: boolean; asOf?: string | null }>,
): HoldingMetrics[] {
  return holdings.map((h) => {
    const close = closes.get(h.symbol);
    const currentPrice = close?.latest ?? null;
    const value = currentPrice !== null ? currentPrice * h.quantity : null;
    const costBasis = h.purchase_price * h.quantity;
    const gain = value !== null ? value - costBasis : null;
    const gainPct = value !== null && costBasis !== 0 ? (gain! / costBasis) * 100 : null;
    return { ...h, currentPrice, value, gain, gainPct, priceStale: close?.stale ?? false, priceAsOf: close?.asOf ?? null };
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

    // A holding with no current price yet (just added, quote not fetched) is
    // excluded from BOTH the current-value and the prior-value sums. Counting
    // it in only one - as the old code did, adding its cost basis to
    // prevTotalValue while contributing nothing to totalValue - silently
    // deflates todayChange by that holding's whole cost basis and shows a
    // phantom same-day loss right after a holding is added.
    if (m.value === null) continue;
    totalValue += m.value;

    const prev = closes.get(m.symbol)?.prev;
    // No prior close (e.g. a newly listed symbol): fall back to the current
    // price so the holding contributes 0 to the day change rather than a
    // spurious swing. m.currentPrice is non-null here because m.value is.
    prevTotalValue += (prev ?? m.currentPrice!) * m.quantity;
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

// `asset_class` is a free-text field on `holdings` (Edit-asset modal's
// "Asset class" input) separate from the structured `asset_type` dropdown
// ("Asset type": equity/etf/crypto/forex/index/future) - most holdings never
// get it filled in. Live check against Adam's real account: NVDA and AMZN
// have asset_class manually set to "Equity"; ISRG, MSFT and BTC don't, and
// all three fell into "Unclassified" in the allocation widget despite every
// one of them carrying a perfectly good asset_type (BTC's is "crypto",
// correct in the Edit-asset modal per the 2026-09-04 walkthrough). This map
// backfills the widget's label from asset_type, in the same singular style
// as the manually-typed "Equity" values, so a holding is only "Unclassified"
// when Cairn genuinely has no classification for it at all.
const ASSET_TYPE_CLASS_LABEL: Record<string, string> = {
  equity: "Equity",
  etf: "ETF",
  crypto: "Crypto",
  forex: "Forex",
  index: "Index",
  future: "Future",
};

export function computeAllocation(
  metrics: HoldingMetrics[],
  groupBy: "asset_class" | "sector" | "asset_type",
): AllocationSlice[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const m of metrics) {
    const value = m.value ?? m.purchase_price * m.quantity;
    const fallback = groupBy === "asset_class" ? (ASSET_TYPE_CLASS_LABEL[m.asset_type] ?? null) : null;
    const key = (m[groupBy] as string | null) || fallback || "Unclassified";
    totals.set(key, (totals.get(key) ?? 0) + value);
    grandTotal += value;
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value, pct: grandTotal !== 0 ? (value / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface ConcentrationSummary {
  topSymbol: string;
  topSharePct: number;
  /** Fewest top-by-value holdings whose combined share exceeds 60% of value. */
  namesOverThreshold: number;
  totalPositions: number;
}

// Powers the "Concentration" callout beside the allocation breakdown - real
// numbers only, computed from the same priced metrics as the rest of the
// page (a holding with no current price yet falls back to cost basis, same
// as computeAllocation, so a newly added position isn't silently excluded).
export function computeConcentration(metrics: HoldingMetrics[]): ConcentrationSummary | null {
  if (metrics.length === 0) return null;
  const priced = metrics
    .map((m) => ({ symbol: m.symbol, value: m.value ?? m.purchase_price * m.quantity }))
    .sort((a, b) => b.value - a.value);
  const total = priced.reduce((sum, p) => sum + p.value, 0);
  if (total <= 0) return null;

  let cumulative = 0;
  let namesOverThreshold = priced.length;
  for (let i = 0; i < priced.length; i++) {
    cumulative += priced[i].value;
    if (cumulative / total > 0.6) {
      namesOverThreshold = i + 1;
      break;
    }
  }

  return {
    topSymbol: priced[0].symbol,
    topSharePct: (priced[0].value / total) * 100,
    namesOverThreshold,
    totalPositions: priced.length,
  };
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
/**
 * Which held symbols the timeline can actually plot.
 *
 * computeTimelineSeries skips any holding with no stored bars (it has no value
 * to add on any date), which is correct arithmetic and was invisible: the chart
 * carried on calling itself "combined holdings value" while covering a subset.
 * An account holding four positions worth EUR 146 was shown a line topping out
 * around EUR 74, because two of the four had no price history at all.
 *
 * The chart uses this to say what it is a line of, instead of overstating it.
 */
export function timelineCoverage(
  holdings: Holding[],
  prices: PriceBar[],
): { covered: string[]; missing: string[] } {
  const withBars = new Set(prices.filter((p) => p.close !== null).map((p) => p.symbol));
  const held = Array.from(new Set(holdings.map((h) => h.symbol)));
  return {
    covered: held.filter((s) => withBars.has(s)),
    missing: held.filter((s) => !withBars.has(s)),
  };
}

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
    dates = allDates.slice(-2); // no intraday feed yet - most recent two closes only
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
  // formatting them as dates would print the same label on every tick. Daily
  // bars are formatted in UTC by formatChartLabel so the calendar date is the
  // same for every viewer (see lib/chart-dates.ts).
  const formatters: Record<ChartView, (iso: string) => string> = {
    "1D": (iso) =>
      isInstant(iso)
        ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : formatChartLabel(iso, { month: "short", day: "numeric" }),
    "1W": (iso) =>
      isInstant(iso)
        ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric" })
        : formatChartLabel(iso, { weekday: "short" }),
    "1M": (iso) => formatChartLabel(iso, { month: "short", day: "numeric" }),
    "3M": (iso) => formatChartLabel(iso, { month: "short", day: "numeric" }),
    "1Y": (iso) => formatChartLabel(iso, { month: "short" }),
    ALL: (iso) => formatChartLabel(iso, { month: "short", year: "2-digit" }),
  };

  return { interval, tickFormatter: formatters[timeframe] };
}
