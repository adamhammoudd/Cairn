"use client";

import Link from "next/link";

// The "Your position" card on the Ticker Detail Profile tab, from
// Cairn "Ticker Detail.dc.html".
//
// Arithmetic only: quantity times the last price, against what it cost. It
// states no view on the position and draws no conclusion from it - the
// scope-guard rule that keeps the AI engine off a reader's personal holdings
// is about analysis, and there is none here. The mock's own line for this card
// is the standard to hold it to: "Cairn reports the arithmetic and nothing
// more."

interface PositionCardProps {
  symbol: string;
  quantity: number;
  /** Weighted average entry across every lot, already in the reader's currency. */
  avgCostLabel: string | null;
  quantityLabel: string;
  valueLabel: string;
  /** Gain/loss against cost basis. Null when there is no cost basis to compare to. */
  gain: { pct: number; amountLabel: string } | null;
}

export function PositionCard({
  symbol,
  quantity,
  avgCostLabel,
  quantityLabel,
  valueLabel,
  gain,
}: PositionCardProps) {
  if (quantity <= 0) return null;

  const positive = gain !== null && gain.pct >= 0;
  const tint = gain === null ? "" : positive ? "from-accent/[0.05]" : "from-negative/[0.05]";

  return (
    <section className={`animate-rise-in overflow-hidden rounded-card border border-line bg-gradient-to-b to-panel ${tint}`}>
      <div className="border-b border-line-soft px-4.5 py-3.5 font-mono text-eyebrow text-muted uppercase">
        Your position
      </div>
      <div className="px-4.5 py-4.5">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-h2 tabular-nums text-primary">{valueLabel}</span>
          {gain && (
            <span
              className={`rounded-control border px-2.5 py-1 font-mono text-caption tabular-nums ${
                positive
                  ? "border-accent/40 bg-accent/10 text-accent-light"
                  : "border-negative/40 bg-negative/10 text-negative-light"
              }`}
            >
              {positive ? "▲" : "▼"} {Math.abs(gain.pct).toFixed(2)}% · {positive ? "+" : "−"}
              {gain.amountLabel}
            </span>
          )}
        </div>
        <p className="mt-2.5 text-micro leading-[1.55] text-dim text-pretty">
          {gain
            ? `Market value at the last price against a cost basis of ${avgCostLabel} per unit. Cairn reports the arithmetic and nothing more.`
            : `Market value at the last price. No cost basis is recorded for ${symbol}, so there is no gain or loss to report.`}
        </p>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-px overflow-hidden rounded-panel border border-line-soft bg-line-soft">
          <div className="bg-canvas px-3.5 py-3">
            <div className="font-mono text-eyebrow text-dim uppercase">Quantity</div>
            <div className="mt-1.5 font-mono text-body tabular-nums text-primary">{quantityLabel}</div>
          </div>
          {avgCostLabel && (
            <div className="bg-canvas px-3.5 py-3">
              <div className="font-mono text-eyebrow text-dim uppercase">Avg cost</div>
              <div className="mt-1.5 font-mono text-body tabular-nums text-primary">{avgCostLabel}</div>
            </div>
          )}
        </div>

        <Link href="/portfolio" className="mt-4 inline-block text-body text-accent hover:underline">
          Open in Portfolio →
        </Link>
      </div>
    </section>
  );
}
