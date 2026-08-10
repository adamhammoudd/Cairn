"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ComparisonCharts } from "@/components/comparison/comparison-charts";
import { ComparisonTable } from "@/components/comparison/comparison-table";
import { MAX_COMPARE, type ComparisonRow } from "@/lib/comparison";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

export function ComparisonPanel({
  universe,
  selected,
  rows,
}: {
  universe: string[];
  selected: string[];
  rows: ComparisonRow[];
}) {
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<ChartView>("3M");

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

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl text-primary">Compare</h2>
        <p className="mt-1 text-[13px] text-muted">Compare up to {MAX_COMPARE} tickers side by side.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selected.map((symbol) => (
          <span
            key={symbol}
            className="flex items-center gap-1.5 rounded-lg bg-active px-3 py-1.5 text-[13px] text-primary"
          >
            {symbol}
            <button type="button" onClick={() => removeSymbol(symbol)} className="text-muted hover:text-negative">
              ×
            </button>
          </span>
        ))}

        {selected.length < MAX_COMPARE && (
          <select
            value=""
            onChange={(e) => addSymbol(e.target.value)}
            className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
          >
            <option value="" disabled>
              + Add symbol
            </option>
            {available.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          Add symbols above to compare.
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-md px-3 py-1.5 text-xs ${timeframe === tf ? "bg-active text-primary" : "text-muted"}`}
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
