"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ComparisonCharts } from "@/components/comparison/comparison-charts";
import { ComparisonTable } from "@/components/comparison/comparison-table";
import { COMPARISON_COLORS, MAX_COMPARE, seriesFor, type ComparisonRow } from "@/lib/comparison";
import { Sparkline } from "@/components/sparkline";
import { SymbolTypeahead } from "@/components/symbol-typeahead";
import { DataFreshness } from "@/components/data-freshness";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatChange, formatMoney } from "@/lib/display-prefs";
import { assetTypeBadge } from "@/lib/screener";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];


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
  const prefs = useDisplayPrefs();
  const [timeframe, setTimeframe] = useState<ChartView>(defaultTimeframe);
  // Adding a symbol re-navigates (`selected` is driven by the URL), and the
  // quick-add chips reorder the instant `available` recomputes - a second
  // click landing before that settles can add the wrong symbol (reported:
  // "I did this myself"). `pendingAdd` briefly locks the row after a click;
  // rather than an effect to clear it back to null (setState-in-effect,
  // cascading render), it's just derived away once `available` no longer
  // contains it - which is exactly the render where the navigation has
  // actually landed.
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const available = universe.filter((s) => !selected.includes(s));
  const isPending = pendingAdd !== null && available.includes(pendingAdd);

  function updateSelection(next: string[]) {
    router.push(next.length > 0 ? `/comparison?symbols=${next.join(",")}` : "/comparison");
  }

  function addSymbol(symbol: string) {
    if (!symbol || isPending || selected.includes(symbol) || selected.length >= MAX_COMPARE) return;
    setPendingAdd(symbol);
    updateSelection([...selected, symbol]);
  }

  function removeSymbol(symbol: string) {
    updateSelection(selected.filter((s) => s !== symbol));
  }

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
            {/* Was a fixed dropdown of the tracked universe, so a symbol Cairn
                had not ingested could not be compared at all. The shared
                type-ahead searches the directory and falls through to the
                provider, ingesting on selection. */}
            <SymbolTypeahead
              name={null}
              clearOnSelect
              required={false}
              exclude={selected}
              placeholder="Add a ticker to compare…"
              onSelect={(r) => addSymbol(r.symbol)}
              className="min-w-[220px]"
              inputClassName="w-full rounded-full border border-dashed border-line bg-transparent px-3.25 py-1.75 font-mono text-[11px] text-muted uppercase outline-none transition-colors duration-base ease-standard placeholder:normal-case hover:border-accent focus:border-accent focus:text-primary"
            />
            {available.slice(0, 3).map((symbol) => (
              <button
                key={symbol}
                type="button"
                disabled={isPending}
                onClick={() => addSymbol(symbol)}
                className={`rounded-full border border-dashed border-line px-3 py-1.5 font-mono text-[11px] text-muted transition-[opacity,color,border-color] duration-200 ease-standard hover:border-accent hover:text-primary ${
                  pendingAdd === symbol ? "opacity-40" : isPending ? "opacity-70" : ""
                }`}
              >
                + {symbol}
              </button>
            ))}
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
                      <div className="mt-0.75 truncate text-[11px] text-muted">
                        {row.name ?? <span className="font-mono tracking-[0.08em] uppercase">{assetTypeBadge(row.assetType)}</span>}
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
                    <span className="font-serif text-[22px] tabular-nums text-primary">
                      {formatMoney(row.price, prefs)}
                    </span>
                    <span className={`text-[12px] tabular-nums ${row.changePct === null ? "text-muted" : positive ? "text-accent" : "text-negative"}`}>
                      {formatChange(absoluteChangeFrom(row.price, row.changePct), row.changePct, prefs)}
                    </span>
                  </div>

                  {/* Coloured by series identity, matching the large chart
                      directly below - these summary sparklines previously
                      coloured by gain/loss, so the same series rendered red
                      here and green or blue there. In this product red means
                      loss and nothing else, so a series cannot borrow it as an
                      identity colour. Direction is still carried by the
                      change figure above, which stays green/red. */}
                  <Sparkline
                    values={seriesFor(row, timeframe).map((p) => p.value)}
                    positive={positive}
                    color={color}
                    className="mt-2.5 h-[70px] w-full"
                    delayMs={i * 60}
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[9.5px] tracking-[0.1em] text-dim uppercase">{timeframe} · same window as the chart</span>
                    <DataFreshness source="last_close" asOf={row.asOf} className="text-[9.5px]" />
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
