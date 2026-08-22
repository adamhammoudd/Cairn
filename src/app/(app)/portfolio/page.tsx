import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  computeAllocation,
  computeHoldingMetrics,
  computeTimelineSeries,
  computeTotals,
  type PriceBar,
} from "@/lib/portfolio";
import { getLatestCloses, latestDataDate } from "@/lib/market-data/current-price";
import type { ChartView } from "@/lib/supabase/types";
import { StatCard } from "@/components/portfolio/stat-card";
import { PortfolioChart } from "@/components/portfolio/portfolio-chart";
import { AllocationPanel } from "@/components/portfolio/allocation-panel";
import { HoldingsTable } from "@/components/portfolio/holdings-table";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default async function PortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: holdings } = await supabase
    .from("holdings")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const rows = holdings ?? [];
  const symbols = Array.from(new Set(rows.map((h) => h.symbol)));

  // Per-symbol history for the timeline. The previous query ordered every row
  // for every held symbol ASCENDING with no limit, which leaves what comes
  // back to PostgREST's row cap - i.e. the OLDEST rows, the same defect that
  // made the ticker page quote a five-month-old price. recent_prices() takes
  // the newest N per symbol; computeTimelineSeries sorts them itself.
  const { data: prices } =
    symbols.length > 0
      ? await supabase.rpc("recent_prices", { symbols, per_symbol: 1500 })
      : { data: [] };

  // recent_prices() returns newest-first within a symbol; everything below
  // wants oldest-first, so sort once here rather than relying on the order the
  // rows happen to arrive in.
  const priceRows = ((prices ?? []) as PriceBar[]).slice().sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const closes = await getLatestCloses(symbols);
  const metrics = computeHoldingMetrics(rows, closes);
  const totals = computeTotals(metrics, closes);

  const seriesByTimeframe = Object.fromEntries(
    TIMEFRAMES.map((tf) => [tf, computeTimelineSeries(rows, priceRows, tf)]),
  ) as Record<ChartView, ReturnType<typeof computeTimelineSeries>>;

  const allocationByDimension = {
    asset_class: computeAllocation(metrics, "asset_class"),
    sector: computeAllocation(metrics, "sector"),
    geography: computeAllocation(metrics, "geography"),
  };

  // Last 30 closes per symbol, oldest-first, for the holdings table's inline
  // trend column. priceRows is sorted ascending above, so slice(-30) is the
  // most recent 30 - it is only correct because of that sort, which is why the
  // sort is not left to chance.
  const sparklines: Record<string, number[]> = {};
  for (const symbol of symbols) {
    sparklines[symbol] = priceRows
      .filter((p) => p.symbol === symbol && p.close !== null)
      .slice(-30)
      .map((p) => Number(p.close));
  }

  const asOf = await latestDataDate(symbols);

  const assetTypeCount = new Set(rows.map((h) => h.asset_type)).size;

  return (
    <div className="animate-page-in">
      <HoldingsTable metrics={metrics} sparklines={sparklines}>
        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <StatCard
            label="Total value"
            value={fmtCurrency(totals.totalValue)}
            sub={`${metrics.length} ${metrics.length === 1 ? "position" : "positions"}`}
          />
          <StatCard
            label="Unrealised gain"
            value={`${totals.totalGain >= 0 ? "+" : ""}${fmtCurrency(totals.totalGain)}`}
            sub={`${totals.totalGainPct >= 0 ? "+" : ""}${totals.totalGainPct.toFixed(2)}% on cost`}
            tone={totals.totalGain >= 0 ? "positive" : "negative"}
            delayMs={50}
          />
          <StatCard
            label="Today"
            value={fmtPct(totals.todayChangePct)}
            sub="Since previous close"
            tone={totals.todayChangePct >= 0 ? "positive" : "negative"}
            delayMs={100}
          />
          <StatCard
            label="Cost basis"
            value={fmtCurrency(totals.totalCostBasis)}
            sub={`Across ${assetTypeCount} asset ${assetTypeCount === 1 ? "type" : "types"}`}
            delayMs={150}
          />
        </div>

        <div className="mb-3.5">
          <PortfolioChart seriesByTimeframe={seriesByTimeframe} hasHoldings={rows.length > 0} asOf={asOf} />
        </div>
      </HoldingsTable>

      {/* Not in the mock, which stops at the holdings table - kept below it so the
          allocation breakdown stays available without displacing the chart. */}
      <div className="mt-3.5">
        <AllocationPanel byDimension={allocationByDimension} />
      </div>
    </div>
  );
}
