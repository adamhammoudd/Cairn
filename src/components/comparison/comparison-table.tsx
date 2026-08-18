"use client";

import { formatMarketCap } from "@/lib/screener";
import type { ComparisonRow } from "@/lib/comparison";

function fmtCurrency(n: number | null) {
  if (n === null) return "—";
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
    label: "24h change",
    cell: (r) =>
      r.changePct === null
        ? { text: "—", tone: "muted" }
        : {
            text: `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`,
            tone: r.changePct >= 0 ? "positive" : "negative",
          },
  },
  { label: "Market cap", cell: (r) => ({ text: formatMarketCap(r.marketCap), tone: r.marketCap === null ? "muted" : "primary" }) },
  { label: "P/E", cell: (r) => ({ text: r.pe === null ? "—" : r.pe.toFixed(1), tone: r.pe === null ? "muted" : "primary" }) },
  {
    label: "Div. yield",
    cell: (r) => ({
      text: r.dividendYield === null ? "—" : `${r.dividendYield.toFixed(2)}%`,
      tone: r.dividendYield === null ? "muted" : "primary",
    }),
  },
  {
    label: "Volume",
    cell: (r) => ({
      text: r.volume === null ? "—" : r.volume.toLocaleString(),
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
    <div>
      <div>
        Aligned metrics
      </div>

      <div>
        <div>
          <div

 >
            <div>Metric</div>
            {rows.map((row) => (
              <div key={row.symbol}>
                {row.symbol}
              </div>
            ))}
          </div>

          {METRICS.map((metric, index) => (
            <div
              key={metric.label}

 >
              <div>{metric.label}</div>
              {rows.map((row) => {
                const cell = metric.cell(row);
                return (
                  <div key={row.symbol}>
                    {cell.text}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
