import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  computeAllocation,
  computeHoldingMetrics,
  computeTimelineSeries,
  computeTotals,
  latestCloseBySymbol,
} from "@/lib/portfolio";
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

  const { data: prices } =
    symbols.length > 0
      ? await supabase.from("historical_prices").select("*").in("symbol", symbols).order("ts", { ascending: true })
      : { data: [] };

  const priceRows = prices ?? [];
  const closes = latestCloseBySymbol(priceRows);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-5">
        <StatCard label="Total value" value={fmtCurrency(totals.totalValue)} />
        <StatCard label="Total cost basis" value={fmtCurrency(totals.totalCostBasis)} />
        <StatCard
          label="Unrealized gain/loss"
          value={`${totals.totalGain >= 0 ? "+" : ""}${fmtCurrency(totals.totalGain)}`}
          tone={totals.totalGain >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Today" value={fmtPct(totals.todayChangePct)} tone={totals.todayChangePct >= 0 ? "positive" : "negative"} />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-5">
        <PortfolioChart seriesByTimeframe={seriesByTimeframe} hasHoldings={rows.length > 0} />
        <AllocationPanel byDimension={allocationByDimension} />
      </div>

      <HoldingsTable metrics={metrics} />
    </div>
  );
}
