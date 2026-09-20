import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MIGRATIONS, unwrap, unwrapRows } from "@/lib/supabase/read";
import {
  computeAllocation,
  computeConcentration,
  computeHoldingMetrics,
  computeTimelineSeries,
  computeTotals,
  timelineCoverage,
  type PriceBar,
} from "@/lib/portfolio";
import { getLatestCloses, latestDataDate, groupBarsBySymbol } from "@/lib/market-data/current-price";
import type { ChartView } from "@/lib/supabase/types";
import { PortfolioStats } from "@/components/portfolio/portfolio-stats";
import { PortfolioChart } from "@/components/portfolio/portfolio-chart";
import { AllocationPanel } from "@/components/portfolio/allocation-panel";
import { ConcentrationPanel } from "@/components/portfolio/concentration-panel";
import { HoldingsTable } from "@/components/portfolio/holdings-table";

import { guardReads } from "@/components/data-unavailable";

// A failed market-data read renders the panel instead of throwing into a
// minified React error; anything else propagates as before.
export default async function PortfolioPage() {
  return guardReads(PortfolioBody);
}


const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

async function PortfolioBody() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A read failure here (an RLS change, a rotated key) must not render as
  // "you own nothing" - an empty portfolio and an unreadable one look identical
  // on screen and mean completely different things to someone checking a balance.
  const [holdingsRes, settingsRes] = await Promise.all([
    supabase.from("holdings").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
    // Poll interval for the live-quote refresh above the holdings table.
    supabase.from("user_settings").select("refresh_rate_seconds").eq("user_id", user.id).maybeSingle(),
  ]);

  const rows = unwrapRows("Portfolio holdings", holdingsRes);
  const symbols = Array.from(new Set(rows.map((h) => h.symbol)));

  // Per-symbol history for the timeline. The previous query ordered every row
  // for every held symbol ASCENDING with no limit, which leaves what comes
  // back to PostgREST's row cap - i.e. the OLDEST rows, the same defect that
  // made the ticker page quote a five-month-old price. recent_prices() takes
  // the newest N per symbol; computeTimelineSeries sorts them itself.
  const pricesRes =
    symbols.length > 0
      ? await supabase.rpc("recent_prices", { symbols, per_symbol: 1500 })
      : { data: [], error: null };
  const prices = unwrap("Portfolio price history (recent_prices)", pricesRes, MIGRATIONS.onDemandIngestion);

  // recent_prices() returns newest-first within a symbol; everything below
  // wants oldest-first, so sort once here rather than relying on the order the
  // rows happen to arrive in.
  const priceRows = ((prices ?? []) as PriceBar[]).slice().sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  // The recent_prices read above already holds every bar these two need. Hand
  // it over so neither fires its own recent_prices round trip - Portfolio was
  // making three (per_symbol 1500, then 2, then 1) for one page. getLatestCloses
  // still layers the live quote on top when the market is open.
  const barsBySymbol = groupBarsBySymbol(priceRows);
  // Ground truth for the crypto-quote hint: each holding's own stored
  // asset_type (what the Edit-asset modal writes), not whatever
  // historical_prices' bars happen to carry - a symbol with missing/stale
  // bars must not silently lose its crypto hint and resolve to the wrong
  // instrument's live quote.
  const assetTypeBySymbol = new Map(rows.map((h) => [h.symbol, h.asset_type]));
  const [closes, asOf] = await Promise.all([
    getLatestCloses(symbols, barsBySymbol, assetTypeBySymbol),
    latestDataDate(symbols, barsBySymbol),
  ]);
  const metrics = computeHoldingMetrics(rows, closes);
  const totals = computeTotals(metrics, closes);

  // Which held symbols the line can actually plot - the chart names the rest
  // rather than quietly leaving them out of a "combined holdings value".
  const coverage = timelineCoverage(rows, priceRows);

  const seriesByTimeframe = Object.fromEntries(
    TIMEFRAMES.map((tf) => [tf, computeTimelineSeries(rows, priceRows, tf)]),
  ) as Record<ChartView, ReturnType<typeof computeTimelineSeries>>;

  const allocationByDimension = {
    asset_class: computeAllocation(metrics, "asset_class"),
    sector: computeAllocation(metrics, "sector"),
  };

  // Last 30 closes per symbol, oldest-first, for the holdings table's inline
  // trend column. Reuses barsBySymbol (built above for the quote reads) instead
  // of re-scanning the whole priceRows array once per held symbol - that was
  // O(symbols x priceRows), avoidable server work on every page load.
  // groupBarsBySymbol sorts each list newest-first, so slice(0, 30).reverse()
  // is the most recent 30 in chronological order.
  const sparklines: Record<string, number[]> = {};
  for (const symbol of symbols) {
    sparklines[symbol] = (barsBySymbol.get(symbol) ?? [])
      .filter((p) => p.close !== null)
      .slice(0, 30)
      .reverse()
      .map((p) => Number(p.close));
  }

  const assetTypeCount = new Set(rows.map((h) => h.asset_type)).size;

  return (
    <div className="animate-page-in">
      <HoldingsTable metrics={metrics} sparklines={sparklines}>
        <PortfolioStats
          totals={totals}
          positions={metrics.length}
          assetTypeCount={assetTypeCount}
          refreshRateSeconds={settingsRes.data?.refresh_rate_seconds ?? null}
        />

        <div className="mb-3.5">
          <PortfolioChart
            seriesByTimeframe={seriesByTimeframe}
            hasHoldings={rows.length > 0}
            asOf={asOf}
            missingHistory={coverage.missing}
            positionCount={symbols.length}
          />
        </div>
      </HoldingsTable>

      {/* Not in the mock, which stops at the holdings table - kept below it so the
          allocation breakdown stays available without displacing the chart. */}
      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-3.5">
        <AllocationPanel byDimension={allocationByDimension} />
        <ConcentrationPanel summary={computeConcentration(metrics)} />
      </div>
    </div>
  );
}
