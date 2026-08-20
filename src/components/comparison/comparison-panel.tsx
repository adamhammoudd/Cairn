"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ComparisonCharts } from "@/components/comparison/comparison-charts";
import { ComparisonTable } from "@/components/comparison/comparison-table";
import { COMPARISON_COLORS, MAX_COMPARE, seriesFor, type ComparisonRow } from "@/lib/comparison";
import { Sparkline } from "@/components/sparkline";
import { SymbolTypeahead } from "@/components/symbol-typeahead";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

function fmtCurrency(n: number | null) {
  if (n === null) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function ComparisonPanel({
  universe,
  selected,
  rows,
  defaultTimeframe = "3M",
}: {
  universe: string[];
  selected: string[];
  rows: ComparisonRow[];
  /** Settings > Display default; which timeframe the page opens on. */
  defaultTimeframe?: ChartView;
}) {
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<ChartView>(defaultTimeframe);

  function updateSelection(next: string[]) {
    router.push(next.length > 0 ? `/comparison?symbols=${next.join(",")}` : "/comparison");
  }

  function addSymbol(symbol: string) {
    if (!symbol || selected.includes(symbol) || selected.length >= MAX_COMPARE) return;
    updateSelection([...selected, symbol]);
  }

  function removeSymbol(symbol: string) {
    updateSelection(selected.filter((s) => s !== symbol));
  }

  const available = universe.filter((s) => !selected.includes(s));
  const canAdd = selected.length < MAX_COMPARE;

  return (
    <div className="animate-page-in flex flex-col gap-3.5">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Compare</div>
          <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">Side by side</h1>
        </div>

        {canAdd && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-dim">Add up to {MAX_COMPARE}:</span>
            {available.slice(0, 4).map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => addSymbol(symbol)}
                className="rounded-full border border-dashed border-line px-3 py-1.5 font-mono text-[11px] text-muted transition-colors duration-base ease-standard hover:border-accent hover:text-primary"
              >
                + {symbol}
              </button>
            ))}
            {available.length > 4 && (
              <select
                value=""
                onChange={(e) => addSymbol(e.target.value)}
                className="rounded-full border border-dashed border-line bg-transparent px-3 py-1.5 font-mono text-[11px] text-muted outline-none transition-colors duration-base ease-standard hover:border-accent hover:text-primary"
              >
                <option value="" disabled>
                  + More…
                </option>
                {available.slice(4).map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
          <div className="font-serif text-[21px] text-primary">Nothing to line up yet</div>
          <p className="mx-auto mt-2 max-w-[400px] text-[13px] text-muted text-pretty">
            Add up to {MAX_COMPARE} tickers and Cairn aligns their price action and fundamentals on the same axes.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {rows.map((row, i) => {
              const color = COMPARISON_COLORS[i % COMPARISON_COLORS.length];
              const positive = (row.changePct ?? 0) >= 0;
              return (
                <div
                  key={row.symbol}
                  className="animate-rise-in rounded-card border border-line bg-panel p-4"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/ticker/${row.symbol}`}
                        className="flex items-center gap-2 text-[14px] text-primary transition-colors duration-fast ease-standard hover:text-accent"
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        {row.symbol}
                      </Link>
                      <div className="mt-0.75 truncate font-mono text-[10.5px] tracking-[0.08em] text-muted uppercase">
                        {row.assetType}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSymbol(row.symbol)}
                      aria-label={`Remove ${row.symbol}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[14px] text-dim transition-colors duration-fast ease-standard hover:bg-negative/12 hover:text-negative"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="font-serif text-[22px] tabular-nums text-primary">{fmtCurrency(row.price)}</span>
                    <span className={`text-[12px] tabular-nums ${row.changePct === null ? "text-muted" : positive ? "text-accent" : "text-negative"}`}>
                      {row.changePct === null ? "-" : `${positive ? "+" : ""}${row.changePct.toFixed(2)}%`}
                    </span>
                  </div>

                  <Sparkline
                    values={seriesFor(row).map((p) => p.value)}
                    positive={positive}
                    className="mt-2.5 h-[70px] w-full"
                    delayMs={i * 60}
                  />
                  <div className="mt-1.5 font-mono text-[9.5px] tracking-[0.1em] text-dim uppercase">
                    Indexed · {timeframe}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-panel p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-lg px-3.25 py-1.75 text-[12.5px] transition-colors duration-base ease-standard ${
                  timeframe === tf ? "bg-active text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <ComparisonCharts rows={rows} timeframe={timeframe} />
          <ComparisonTable rows={rows} />
        </>
      )}
    </div>
  );
}
