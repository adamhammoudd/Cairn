"use client";

import { formatMarketCap } from "@/lib/screener";
import type { ComparisonRow } from "@/lib/comparison";

function fmtCurrency(n: number | null) {
  if (n === null) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

interface Cell {
  text: string;
  tone: "primary" | "muted" | "positive" | "negative";
}

const TONE_CLASS: Record<Cell["tone"], string> = {
  primary: "text-primary",
  muted: "text-muted",
  positive: "text-accent",
  negative: "text-negative",
};

const METRICS: { label: string; cell: (row: ComparisonRow) => Cell }[] = [
  { label: "Price", cell: (r) => ({ text: fmtCurrency(r.price), tone: r.price === null ? "muted" : "primary" }) },
  {
    // Crypto carries CoinGecko's rolling 24h figure and session-based markets
    // the last two closes - the same rule every other surface follows. The
    // footnote below the table says so rather than one label implying both.
    label: "Change",
    cell: (r) =>
      r.changePct === null
        ? { text: "-", tone: "muted" }
        : {
            text: `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`,
            tone: r.changePct >= 0 ? "positive" : "negative",
          },
  },
  { label: "Market cap", cell: (r) => ({ text: formatMarketCap(r.marketCap), tone: r.marketCap === null ? "muted" : "primary" }) },
  { label: "P/E", cell: (r) => ({ text: r.pe === null ? "-" : r.pe.toFixed(1), tone: r.pe === null ? "muted" : "primary" }) },
  {
    label: "Div. yield",
    cell: (r) => ({
      text: r.dividendYield === null ? "-" : `${r.dividendYield.toFixed(2)}%`,
      tone: r.dividendYield === null ? "muted" : "primary",
    }),
  },
  {
    label: "Volume",
    cell: (r) => ({
      text: r.volume === null ? "-" : r.volume.toLocaleString(),
      tone: r.volume === null ? "muted" : "primary",
    }),
  },
  { label: "Asset type", cell: (r) => ({ text: r.assetType, tone: "muted" }) },
];

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  // Metric-per-row, symbol-per-column so the same measure lines up horizontally
  // across every ticker.
  const gridTemplate = `minmax(120px, 170px) repeat(${rows.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="border-b border-line px-4.5 py-3.25 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
        Aligned metrics
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-fit">
          <div
            className="grid items-center gap-3 border-b border-line px-4.5 py-2.75 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div>Metric</div>
            {rows.map((row) => (
              <div key={row.symbol} className="text-primary">
                {row.symbol}
              </div>
            ))}
          </div>

          {METRICS.map((metric, index) => (
            <div
              key={metric.label}
              className="animate-rise-in grid items-center gap-3 border-b border-line px-4.5 py-3.25 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
              style={{ gridTemplateColumns: gridTemplate, animationDelay: `${index * 30}ms` }}
            >
              <div className="text-[12px] text-muted">{metric.label}</div>
              {rows.map((row) => {
                const cell = metric.cell(row);
                return (
                  <div key={row.symbol} className={`text-[13px] tabular-nums ${TONE_CLASS[cell.tone]}`}>
                    {cell.text}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="border-t border-line px-4.5 py-2.75 text-[11.5px] text-dim">
        Change is CoinGecko&apos;s rolling 24 hours for crypto and the last two daily closes for session-based markets -
        the same figure each asset shows on its own page. Prices are last closes, not live quotes.
      </p>
    </div>
  );
}
