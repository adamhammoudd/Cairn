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
import { gainSplit } from "@/lib/gain-split";

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
  live = false,
}: {
  totals: PortfolioTotals;
  positions: number;
  assetTypeCount: number;
  /** user_settings.refresh_rate_seconds - poll cadence for the live-quote refresh. */
  refreshRateSeconds?: number | null;
  /** True only when a price on this page came from a live quote; gates the "Updates every N min" label. */
  live?: boolean;
}) {
  const prefs = useDisplayPrefs();
  // A reader whose display currency differs from the assets': the gain in their
  // own money is the price move plus what the exchange rate did since each
  // purchase, and the card says how much is which. Null (hidden) otherwise.
  const split = gainSplit(totals, prefs, positions);

  return (
    <>
      <div className="mb-2 flex min-h-[18px] justify-end">
        <LivePricePoll refreshRateSeconds={refreshRateSeconds} live={live} />
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
      >
        {split && (
          <dl className="mt-0.5 flex flex-col gap-0.5 border-t border-[#232323] pt-1.5 text-caption text-muted" aria-label="Where the gain comes from">
            <div className="flex justify-between gap-2">
              <dt className="min-w-0">From the price</dt>
              <dd className="shrink-0 whitespace-nowrap font-mono tabular-nums text-primary">{split.priceLabel.replace("From the price: ", "")}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="min-w-0">From the exchange rate</dt>
              <dd className="shrink-0 whitespace-nowrap font-mono tabular-nums text-primary">{split.exchangeLabel.replace("From the exchange rate: ", "")}</dd>
            </div>
            {split.note && <div className="mt-0.5 text-micro text-dim">{split.note}</div>}
          </dl>
        )}
      </StatCard>
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
