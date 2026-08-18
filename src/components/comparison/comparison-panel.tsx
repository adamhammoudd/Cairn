"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ComparisonCharts } from "@/components/comparison/comparison-charts";
import { ComparisonTable } from "@/components/comparison/comparison-table";
import { COMPARISON_COLORS, MAX_COMPARE, type ComparisonRow } from "@/lib/comparison";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

function fmtCurrency(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

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
  const canAdd = selected.length < MAX_COMPARE;

  return (
    <div>
      <div>
        <div>
          <div>Compare</div>
          <h1>Side by side</h1>
        </div>

        {canAdd && (
          <div>
            <span>Add up to {MAX_COMPARE}:</span>
            {available.slice(0, 4).map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => addSymbol(symbol)}

 >
                + {symbol}
              </button>
            ))}
            {available.length > 4 && (
              <select
                value=""
                onChange={(e) => addSymbol(e.target.value)}

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
        <div>
          <div>Nothing to line up yet</div>
          <p>
            Add up to {MAX_COMPARE} tickers and Cairn aligns their price action and fundamentals on the same axes.
          </p>
        </div>
      ) : (
        <>
          <div>
            {rows.map((row, i) => {
              const color = COMPARISON_COLORS[i % COMPARISON_COLORS.length];
              const positive = (row.changePct ?? 0) >= 0;
              return (
                <div
                  key={row.symbol}

 >
                  <div>
                    <div>
                      <Link
                        href={`/ticker/${row.symbol}`}

 >
                        <span />
                        {row.symbol}
                      </Link>
                      <div>
                        {row.assetType}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSymbol(row.symbol)}
                      aria-label={`Remove ${row.symbol}`}

 >
                      ×
                    </button>
                  </div>

                  <div>
                    <span>{fmtCurrency(row.price)}</span>
                    <span>
                      {row.changePct === null ? "—" : `${positive ? "+" : ""}${row.changePct.toFixed(2)}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}

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
