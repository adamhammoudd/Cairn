"use client";

import { ASSET_TYPE_TAG_CLASS, assetTypeBadge, formatMarketCap } from "@/lib/screener";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatAssetChange, formatAssetMoney, pricesInLabel, type DisplayPrefs } from "@/lib/display-prefs";
import { COMPARISON_COLORS, seriesFor, type ComparisonRow } from "@/lib/comparison";
import type { ChartView } from "@/lib/supabase/types";

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

// Every money cell is asset money: each column in its own symbol's currency,
// never converted (feat/native-currency). `cell` still takes the display
// preferences for the percent-vs-money choice on the change row.
const METRICS: { label: string; cell: (row: ComparisonRow, prefs: DisplayPrefs, timeframe: ChartView) => Cell }[] = [
  {
    label: "Last price",
    cell: (r) => ({ text: formatAssetMoney(r.price, r.currency), tone: r.price === null ? "muted" : "primary" }),
  },
  {
    // The move across the window the chart above is drawing, so the table and
    // the lines say the same thing. Computed from the same series.
    label: "Range change",
    cell: (r, _prefs, timeframe) => {
      const pts = seriesFor(r, timeframe);
      const base = pts[0]?.value;
      const end = pts[pts.length - 1]?.value;
      if (pts.length < 2 || !base || end === undefined || !Number.isFinite(base)) return { text: "-", tone: "muted" };
      const pct = (end / base - 1) * 100;
      return { text: `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`, tone: pct >= 0 ? "positive" : "negative" };
    },
  },
  {
    // Crypto carries CoinGecko's rolling 24h figure and session-based markets
    // the last two closes - the same rule every other surface follows. The
    // footnote below the table says so rather than one label implying both.
    label: "24h change",
    cell: (r, prefs) =>
      r.changePct === null
        ? { text: "-", tone: "muted" }
        : {
            text: formatAssetChange(absoluteChangeFrom(r.price, r.changePct), r.changePct, r.currency, prefs),
            tone: r.changePct >= 0 ? "positive" : "negative",
          },
  },
  { label: "Market cap", cell: (r) => ({ text: formatMarketCap(r.marketCap, r.currency), tone: r.marketCap === null ? "muted" : "primary" }) },
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

export function ComparisonTable({ rows, timeframe }: { rows: ComparisonRow[]; timeframe: ChartView }) {
  const prefs = useDisplayPrefs();
  // Metric-per-row, symbol-per-column so the same measure lines up horizontally
  // across every ticker.
  const gridTemplate = `minmax(120px, 170px) repeat(${rows.length}, minmax(0, 1fr))`;

  return (
    <div className="animate-rise-in overflow-hidden rounded-card border border-line-soft bg-panel" style={{ animationDelay: "140ms" }}>
      <div className="overflow-x-auto">
        <div className="min-w-fit">
          <div
            className="grid items-center gap-3.5 border-b border-line-soft bg-canvas px-5 py-3.5 font-mono text-eyebrow tracking-[0.16em] text-dim uppercase"
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
              className="cn-row animate-rise-in grid items-center gap-3.5 border-b border-active px-5 py-3 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-raised"
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
                const cell = metric.cell(row, prefs, timeframe);
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
        the same figure each asset shows on its own page. Prices are last closes, not live quotes. {pricesInLabel(rows.map((r) => r.currency))}.
      </p>
    </div>
  );
}
