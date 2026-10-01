"use client";

import { StatCard } from "@/components/portfolio/stat-card";
import { LivePricePoll } from "@/components/live-price-poll";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import {
  formatCompactUserMoney,
  formatCompactSignedUserMoney,
  formatUserMoney,
  formatPercent,
  formatSignedUserMoney,
} from "@/lib/display-prefs";
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
  refreshRateSeconds = null,
}: {
  totals: PortfolioTotals;
  positions: number;
  assetTypeCount: number;
  /** user_settings.refresh_rate_seconds - poll cadence for the live-quote refresh. */
  refreshRateSeconds?: number | null;
}) {
  const prefs = useDisplayPrefs();

  return (
    <>
      <div className="mb-2 flex min-h-[18px] justify-end">
        <LivePricePoll refreshRateSeconds={refreshRateSeconds} />
      </div>
      <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-3">
      <StatCard
        label="Total value"
        value={formatCompactUserMoney(totals.totalValue, prefs)}
        exact={formatUserMoney(totals.totalValue, prefs)}
        sub={`${positions} ${positions === 1 ? "position" : "positions"}`}
      />
      <StatCard
        label="Unrealised gain"
        value={formatCompactSignedUserMoney(totals.totalGain, prefs)}
        exact={formatSignedUserMoney(totals.totalGain, prefs)}
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
        value={formatCompactUserMoney(totals.totalCostBasis, prefs)}
        exact={formatUserMoney(totals.totalCostBasis, prefs)}
        sub={`Across ${assetTypeCount} asset ${assetTypeCount === 1 ? "type" : "types"}`}
        delayMs={150}
        accent="var(--color-info)"
      />
      </div>
    </>
  );
}
