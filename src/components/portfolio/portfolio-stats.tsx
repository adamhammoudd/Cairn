"use client";

import { StatCard } from "@/components/portfolio/stat-card";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney, formatPercent, formatSignedMoney } from "@/lib/display-prefs";
import type { PortfolioTotals } from "@/lib/portfolio";

// The four headline figures above the holdings table. Split out of the
// (server) Portfolio page purely so they can read the display preferences:
// formatting them on the server pinned them to USD while the table two inches
// below followed the currency setting - the same figure in two currencies on
// one screen.
export function PortfolioStats({
  totals,
  positions,
  assetTypeCount,
}: {
  totals: PortfolioTotals;
  positions: number;
  assetTypeCount: number;
}) {
  const prefs = useDisplayPrefs();

  return (
    <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <StatCard
        label="Total value"
        value={formatMoney(totals.totalValue, prefs)}
        sub={`${positions} ${positions === 1 ? "position" : "positions"}`}
      />
      <StatCard
        label="Unrealised gain"
        value={formatSignedMoney(totals.totalGain, prefs)}
        sub={`${formatPercent(totals.totalGainPct)} on cost`}
        tone={totals.totalGain >= 0 ? "positive" : "negative"}
        delayMs={50}
      />
      <StatCard
        label="Today"
        value={formatPercent(totals.todayChangePct)}
        sub="Since previous close"
        tone={totals.todayChangePct >= 0 ? "positive" : "negative"}
        delayMs={100}
      />
      <StatCard
        label="Cost basis"
        value={formatMoney(totals.totalCostBasis, prefs)}
        sub={`Across ${assetTypeCount} asset ${assetTypeCount === 1 ? "type" : "types"}`}
        delayMs={150}
      />
    </div>
  );
}
