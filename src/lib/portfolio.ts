import type { ChartView, Database } from "@/lib/supabase/types";
import { formatChartLabel, isInstant } from "@/lib/chart-dates";
import { costRatio, rateOn, type CostFx, type CostRate } from "@/lib/fx-history";

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
  /** What was paid, in dollars (purchase_price x quantity), unconverted. */
  costBasisUsd: number;
  /**
   * What the gain is measured from, in the same units as `value` ("USD at
   * today's rate": x DisplayPrefs.fxRate is the display currency). Equals
   * costBasisUsd for a USD reader; for anyone else it is the dollars paid
   * converted at the rate on the PURCHASE DATE (lib/fx-history.ts), so the gain
   * is what they actually made in their own money.
   */
  costBasis: number;
  /** Whether costBasis used the purchase date's rate or fell back to today's. */
  costRate: CostRate;
  gain: number | null;
  gainPct: number | null;
  /** The asset's own move (value - costBasisUsd), at today's rate. Null when unpriced. */
  priceGain: number | null;
  /** What the exchange rate added since purchase (costBasisUsd - costBasis). Null when unpriced. */
  fxGain: number | null;
  /** True when currentPrice fell back to a stale stored close - see getLatestCloses(). */
  priceStale: boolean;
  /** Date currentPrice is as of (bar date, or the live quote's own date). */
  priceAsOf: string | null;
}

/**
 * Per-holding value, cost and gain. `costFx` is the reader's USD -> display
 * currency history (loadCostFx); null for a USD reader, who is unchanged. With
 * it, the cost is converted at the rate on each holding's purchase date and the
 * gain is value today minus that cost - see lib/fx-history.ts.
 */
export function computeHoldingMetrics(
  holdings: Holding[],
  closes: Map<string, { latest: number | null; prev: number | null; stale?: boolean; asOf?: string | null }>,
  costFx: CostFx | null = null,
): HoldingMetrics[] {
  return holdings.map((h) => {
    const close = closes.get(h.symbol);
    const currentPrice = close?.latest ?? null;
    const value = currentPrice !== null ? currentPrice * h.quantity : null;
    const costBasisUsd = h.purchase_price * h.quantity;
    const { ratio, basis } = costRatio(costFx, h.purchase_date);
    const costBasis = costBasisUsd * ratio;
    const gain = value !== null ? value - costBasis : null;
    const gainPct = value !== null && costBasis !== 0 ? (gain! / costBasis) * 100 : null;
    return {
      ...h,
      currentPrice,
      value,
      costBasisUsd,
      costBasis,
      costRate: basis,
      gain,
      gainPct,
      priceGain: value !== null ? value - costBasisUsd : null,
      fxGain: value !== null ? costBasisUsd - costBasis : null,
      priceStale: close?.stale ?? false,
      priceAsOf: close?.asOf ?? null,
    };
  });
}

export interface PortfolioTotals {
  totalValue: number;
  totalCostBasis: number;
  totalGain: number;
  totalGainPct: number;
  /** Of totalGain: the assets' own moves, at today's rate. */
  totalPriceGain: number;
  /** Of totalGain: what the exchange rate added since each purchase. 0 for a USD reader. */
  totalFxGain: number;
  /** True when the cost was converted into a non-USD display currency (the split is meaningful). */
  costConverted: boolean;
  /** Holdings whose cost had to use today's rate - no rate held for the purchase date. */
  costAtTodayRateCount: number;
  todayChangeValue: number;
  todayChangePct: number;
}

/**
 * Summary figures for the Total Value / gain / Today cards.
 *
 * A holding with no current price (m.value === null - just added, or a symbol
 * Cairn genuinely cannot price) counts at its COST BASIS, in BOTH totalValue
 * and prevTotalValue. That is the same fallback computeAllocation() and
 * computeConcentration() use, so the Total Value card and the panels built
 * from the same metrics always agree - excluding it here while they counted
 * it is what made one /portfolio load contradict itself. Keep all three on
 * this one convention.
 *
 * Counting it in both sums is also what keeps it out of the day change: in
 * only the prior-value sum it shows a phantom same-day loss of its whole cost
 * basis (audit 2026-09-04, PR #60); in only totalValue, a phantom gain.
 */
export function computeTotals(
  metrics: HoldingMetrics[],
  closes: Map<string, { latest: number | null; prev: number | null }>,
): PortfolioTotals {
  let totalValue = 0;
  let totalCostBasis = 0;
  let prevTotalValue = 0;
  let totalPriceGain = 0;
  let totalFxGain = 0;
  let costConverted = false;
  let costAtTodayRateCount = 0;

  for (const m of metrics) {
    const costBasis = m.costBasis;
    totalCostBasis += costBasis;
    if (m.costRate !== "same-currency") costConverted = true;
    if (m.costRate === "today-rate") costAtTodayRateCount++;

    // No price: cost basis on both sides, so it adds 0 to gain and to the day
    // change. Not `prev` - a stranded prior close against a cost-basis value
    // would invent a move.
    if (m.value === null) {
      totalValue += costBasis;
      prevTotalValue += costBasis;
      continue;
    }
    totalValue += m.value;
    totalPriceGain += m.priceGain ?? 0;
    totalFxGain += m.fxGain ?? 0;

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

  return {
    totalValue,
    totalCostBasis,
    totalGain,
    totalGainPct,
    totalPriceGain,
    totalFxGain,
    costConverted,
    costAtTodayRateCount,
    todayChangeValue,
    todayChangePct,
  };
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
    const value = m.value ?? m.costBasis;
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
    .map((m) => ({ symbol: m.symbol, value: m.value ?? m.costBasis }))
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

export function computeTimelineSeries(
  holdings: Holding[],
  prices: PriceBar[],
  timeframe: ChartView,
  costFx: CostFx | null = null,
): TimelinePoint[] {
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

      // Each point is valued at the rate of ITS day, not today's: a euro reader's
      // line from last December is what the position was worth in euros then.
      // Carried in "USD at today's rate" units like every other figure, so the
      // chart's formatter is unchanged and the last point equals Total value.
      // A day with no rate held (older than the table) keeps today's rate.
      const dayRate = costFx ? rateOn(costFx, date) : null;
      const ratio = costFx && dayRate !== null && costFx.today > 0 ? dayRate / costFx.today : 1;
      return anyActive ? { date, value: value * ratio } : null;
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
