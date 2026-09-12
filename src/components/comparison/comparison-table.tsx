"use client";

import { ASSET_TYPE_TAG_CLASS, assetTypeBadge, formatMarketCap } from "@/lib/screener";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatChange, formatMoney, type DisplayPrefs } from "@/lib/display-prefs";
import { COMPARISON_COLORS, type ComparisonRow } from "@/lib/comparison";

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

// `cell` takes the display preferences rather than closing over a module-level
// formatter, so the Price row and the Change row both follow Settings >
// Display. A module-scope fmtCurrency() is exactly how this table came to be
// the one surface still printing dollars after a currency change.
const METRICS: { label: string; cell: (row: ComparisonRow, prefs: DisplayPrefs) => Cell }[] = [
  {
    label: "Price",
    cell: (r, prefs) => ({ text: formatMoney(r.price, prefs), tone: r.price === null ? "muted" : "primary" }),
  },
  {
    // Crypto carries CoinGecko's rolling 24h figure and session-based markets
    // the last two closes - the same rule every other surface follows. The
    // footnote below the table says so rather than one label implying both.
    label: "Change",
    cell: (r, prefs) =>
      r.changePct === null
        ? { text: "-", tone: "muted" }
        : {
            text: formatChange(absoluteChangeFrom(r.price, r.changePct), r.changePct, prefs),
            tone: r.changePct >= 0 ? "positive" : "negative",
          },
  },
  { label: "Market cap", cell: (r, prefs) => ({ text: formatMarketCap(r.marketCap, prefs), tone: r.marketCap === null ? "muted" : "primary" }) },
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
  // Rendered as a pill below instead of through `cell` - kept here only so
  // the row still appears in this list with its label, in order.
  { label: "Asset type", cell: (r) => ({ text: r.assetType, tone: "muted" }) },
];

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const prefs = useDisplayPrefs();
  // Metric-per-row, symbol-per-column so the same measure lines up horizontally
  // across every ticker.
  const gridTemplate = `minmax(120px, 170px) repeat(${rows.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#232323] bg-panel">
      <div className="border-b border-[#1c1c1c] bg-[#0c0c0c] px-5 py-3.5 font-mono text-eyebrow tracking-[0.16em] text-primary uppercase">
        Aligned metrics
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-fit">
          <div
            className="grid items-center gap-3.5 border-b border-[#1c1c1c] bg-[#0c0c0c] px-5 py-3.5 font-mono text-eyebrow tracking-[0.16em] text-dim uppercase"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div>Metric</div>
            {/* Each column head takes its series colour, so a column in the
                table and a line in the chart above are the same ticker
                without having to re-read the header. */}
            {rows.map((row, i) => (
              <div
                key={row.symbol}
                className="tracking-[0.12em]"
                style={{ color: COMPARISON_COLORS[i % COMPARISON_COLORS.length] }}
              >
                {row.symbol}
              </div>
            ))}
          </div>

          {METRICS.map((metric, index) => (
            <div
              key={metric.label}
              className="cn-row animate-rise-in grid items-center gap-3.5 border-b border-[#171717] px-5 py-3 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-raised"
              style={{ gridTemplateColumns: gridTemplate, animationDelay: `${index * 30}ms` }}
            >
              <div className="text-[12.5px] text-muted">{metric.label}</div>
              {rows.map((row) => {
                // Every other page shows asset type as an uppercase pill
                // (see ticker-list.tsx); this table printed the raw
                // lowercase value as plain text, the one row here without a
                // real "-" empty-state either, so it gets its own render
                // rather than forcing a JSX-shaped Cell into every metric.
                if (metric.label === "Asset type") {
                  return (
                    <div key={row.symbol}>
                      <span
                        className={`rounded-full border px-2 py-1 font-mono text-eyebrow tracking-[0.1em] uppercase ${
                          ASSET_TYPE_TAG_CLASS[row.assetType] ?? "text-muted border-line"
                        }`}
                      >
                        {assetTypeBadge(row.assetType)}
                      </span>
                    </div>
                  );
                }
                const cell = metric.cell(row, prefs);
                return (
                  <div key={row.symbol} className={`text-body tabular-nums ${TONE_CLASS[cell.tone]}`}>
                    {cell.text}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="border-t border-line px-4.5 py-3 text-caption text-dim">
        Change is CoinGecko&apos;s rolling 24 hours for crypto and the last two daily closes for session-based markets -
        the same figure each asset shows on its own page. Prices are last closes, not live quotes.
      </p>
    </div>
  );
}
