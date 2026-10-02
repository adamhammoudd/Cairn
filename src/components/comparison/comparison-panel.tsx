"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ComparisonCharts } from "@/components/comparison/comparison-charts";
import { ComparisonTable } from "@/components/comparison/comparison-table";
import { COMPARISON_COLORS, MAX_COMPARE, type ComparisonRow } from "@/lib/comparison";
import { SymbolTypeahead } from "@/components/symbol-typeahead";
import { DataFreshness } from "@/components/data-freshness";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];


export function ComparisonPanel({
  universe,
  suggestions,
  selected,
  rows,
  defaultTimeframe = "3M",
}: {
  universe: string[];
  /** Held, then watched, then the largest by market cap (getCompareSuggestions). */
  suggestions: string[];
  selected: string[];
  rows: ComparisonRow[];
  /** Settings > Display default; which timeframe the page opens on. */
  defaultTimeframe?: ChartView;
}) {
  const router = useRouter();
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
  // The chips come from the ranked suggestions, not from the alphabetical universe.
  const chips = suggestions.filter((s) => !selected.includes(s) && universe.includes(s));
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
    <div className="animate-page-in mx-auto flex max-w-[1240px] flex-col gap-3.5">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-[18px]">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Compare</div>
          <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
            Side by side
          </h1>
          <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-muted text-pretty">
            Add up to {MAX_COMPARE} tickers and Cairn aligns their price action and fundamentals on the same axes.
          </p>
        </div>

        {canAdd && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-dim">
              {selected.length} of {MAX_COMPARE} slots used
            </span>
            {chips.slice(0, 3).map((symbol) => (
              <button
                key={symbol}
                type="button"
                disabled={isPending}
                onClick={() => addSymbol(symbol)}
                className={`rounded-full border border-dashed border-line px-3 py-1.5 font-mono text-micro text-muted transition-[opacity,color,border-color] duration-200 ease-standard hover:border-accent hover:text-primary ${
                  pendingAdd === symbol ? "opacity-40" : isPending ? "opacity-70" : ""
                }`}
              >
                + {symbol}
              </button>
            ))}
          </div>
        )}
      </div>

      <section
        className="animate-rise-in relative overflow-hidden rounded-card border border-[#232323] bg-gradient-to-b from-[#101110] to-[#0d0d0d] px-6 py-5.5"
        style={{ animationDelay: "60ms" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: "-60% 55% 45% -12%",
            background: "radial-gradient(closest-side, rgba(91,141,239,.16), transparent)",
            animation: "cn-glow 7s ease-in-out infinite",
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {rows.map((row, i) => {
              const color = COMPARISON_COLORS[i % COMPARISON_COLORS.length];
              return (
                <span
                  key={row.symbol}
                  className="inline-flex items-center gap-2 rounded-full border px-[11px] py-[7px] font-mono text-[11.5px] text-primary"
                  style={{ borderColor: `${color}55`, background: `${color}14` }}
                >
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
                  <Link
                    href={`/ticker/${row.symbol}`}
                    title={row.name ?? undefined}
                    className="transition-colors duration-fast ease-standard hover:text-accent-light"
                  >
                    {row.symbol}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeSymbol(row.symbol)}
                    aria-label={`Remove ${row.symbol}`}
                    className="ml-0.5 px-0.5 text-[13px] text-dim transition-colors duration-fast ease-standard hover:text-negative-light"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {canAdd && (
              <SymbolTypeahead
                // The shared type-ahead searches the directory and falls
                // through to the provider, ingesting on selection - so a
                // symbol Cairn has not seen yet can still be compared.
                name={null}
                clearOnSelect
                required={false}
                exclude={selected}
                placeholder="Add a ticker…"
                onSelect={(r) => addSymbol(r.symbol)}
                className="min-w-[180px]"
                inputClassName="w-full rounded-full border border-line bg-panel px-3.5 py-[7px] font-mono text-[11.5px] text-primary uppercase outline-none transition-colors duration-base ease-standard placeholder:normal-case placeholder:text-dim hover:border-line-strong focus:border-accent"
              />
            )}
          </div>
          <div className="flex gap-[3px] rounded-[10px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-[7px] px-[11px] py-[5px] font-mono text-micro transition-colors duration-base ease-standard ${
                  timeframe === tf ? "bg-[#1e1e1e] text-primary" : "text-dim hover:text-primary"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="relative">
            <ComparisonCharts rows={rows} timeframe={timeframe} />
            <div className="mt-2 flex justify-end">
              <DataFreshness source="last_close" asOf={rows.reduce<string | null>((n, r) => (r.asOf && (!n || r.asOf > n) ? r.asOf : n), null)} />
            </div>
          </div>
        ) : (
          <div className="relative mt-4.5 flex flex-col items-center gap-2.5 rounded-card border border-dashed border-line px-5 py-16">
            <svg width="54" height="34" viewBox="0 0 54 34" aria-hidden="true">
              <path
                d="M2 26 C 12 26, 14 8, 24 8 S 40 24, 52 6"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-draw"
              />
              <path
                d="M2 30 C 14 30, 18 18, 28 20 S 42 30, 52 22"
                fill="none"
                stroke="var(--color-info)"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-draw"
                style={{ animationDelay: "180ms" }}
              />
            </svg>
            <div className="font-serif text-h2 text-primary">Nothing to line up yet</div>
            <p className="max-w-[400px] text-center text-body leading-[1.6] text-muted text-pretty">
              Add a ticker above - or start from one of the suggestions - and Cairn rebases everything to the same zero.
            </p>
          </div>
        )}
      </section>

      {rows.length > 0 && <ComparisonTable rows={rows} timeframe={timeframe} />}

      <p className="mt-2.5 text-center text-caption text-dim">Prices are daily closes, not a live feed. Nothing here is a recommendation.</p>
    </div>
  );
}
