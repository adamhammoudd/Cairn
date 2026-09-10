"use client";

import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP, CHART_AXIS_TICK, CHART_GRID } from "@/lib/chart-theme";
import { xAxisConfig } from "@/lib/portfolio";
import { formatTooltipLabel } from "@/lib/chart-dates";
import { buildPriceSeries } from "@/lib/ticker";
import { COMPARISON_COLORS, type ComparisonRow } from "@/lib/comparison";
import type { ChartView } from "@/lib/supabase/types";

// One chart, one timeline.
//
// The previous build drew a separate AreaChart per symbol and relied on
// recharts' `syncId` to line them up. syncId matches by ARRAY INDEX, not by
// date -- and the symbols don't share a date range (equities in this dataset
// start 2024-08-08, crypto 2025-08-11), so index 0 was a different day on
// every panel: the axes disagreed, the tooltip cross-referenced unrelated
// dates, and a short-history symbol was stretched across the same pixel width
// as a long-history one. Merging every symbol onto a single date-keyed row set
// removes the whole class of bug -- the x-axis is now literally shared.
//
// Values are indexed to 100 at each symbol's first bar inside the window, the
// only way $4 and $400 instruments c-n share one y-axis and still be
// comparable. Absolute prices stay on the summary cards and the table.
interface MergedPoint {
  date: string;
  [symbol: string]: string | number | null;
}

function buildMergedSeries(rows: ComparisonRow[], timeframe: ChartView) {
  const seriesBySymbol = new Map<string, Map<string, number>>();
  const dates = new Set<string>();

  for (const row of rows) {
    const points = buildPriceSeries(row.bars, timeframe);
    if (points.length === 0) continue;
    const base = points[0].value;
    const indexed = new Map<string, number>();
    for (const p of points) {
      // A zero or non-finite base would make every indexed value Infinity;
      // skip the symbol rather than poisoning the shared y-domain.
      if (!Number.isFinite(base) || base === 0) continue;
      indexed.set(p.date, (p.value / base) * 100);
      dates.add(p.date);
    }
    if (indexed.size > 0) seriesBySymbol.set(row.symbol, indexed);
  }

  const sortedDates = Array.from(dates).sort();
  const merged: MergedPoint[] = sortedDates.map((date) => {
    const point: MergedPoint = { date };
    for (const [symbol, indexed] of seriesBySymbol) {
      // null (not 0, not omitted) so recharts leaves a gap on days a symbol
      // has no bar instead of drawing a line down to the axis.
      point[symbol] = indexed.get(date) ?? null;
    }
    return point;
  });

  return { merged, plotted: Array.from(seriesBySymbol.keys()) };
}

export function ComparisonCharts({ rows, timeframe }: { rows: ComparisonRow[]; timeframe: ChartView }) {
  const { merged, plotted } = useMemo(() => buildMergedSeries(rows, timeframe), [rows, timeframe]);
  const colorBySymbol = useMemo(
    () => new Map(rows.map((r, i) => [r.symbol, COMPARISON_COLORS[i % COMPARISON_COLORS.length]])),
    [rows],
  );

  // xAxisConfig wants TimelinePoint[]; the merged rows carry the same `date`
  // key and it only reads dates and length.
  const { interval, tickFormatter } = useMemo(
    () => xAxisConfig(merged.map((m) => ({ date: m.date, value: 0 })), timeframe),
    [merged, timeframe],
  );

  // A symbol whose history doesn't reach into the selected window is dropped
  // from the plot - say so rather than leaving an unexplained missing line.
  const missing = rows.filter((r) => !plotted.includes(r.symbol)).map((r) => r.symbol);

  if (merged.length === 0) {
    return (
      <div className="rounded-card border border-line bg-panel p-4">
        <div className="flex h-[300px] items-center justify-center text-caption text-muted">
          No overlapping price history for this timeframe.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-eyebrow text-muted uppercase">
          Indexed to 100 · shared timeline · {timeframe}
        </div>
        <div className="text-caption text-dim">
          Relative move from the start of the window - absolute prices are on the cards above.
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            dataKey="date"
            interval={interval}
            tickFormatter={tickFormatter}
            tick={CHART_AXIS_TICK}
            axisLine={{ stroke: "var(--color-line)" }}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            width={44}
            domain={["auto", "auto"]}
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => Number(v).toFixed(0)}
          />
          <Tooltip
            formatter={(value, name) => [`${Number(value).toFixed(1)} (${(Number(value) - 100).toFixed(1)}%)`, name]}
            labelFormatter={(label) => formatTooltipLabel(String(label))}
            {...CHART_TOOLTIP}
            itemSorter={(item) => -Number(item.value ?? 0)}
          />
          <Legend
            verticalAlign="top"
            height={26}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, color: "var(--color-muted)" }}
          />
          {plotted.map((symbol) => (
            <Line
              key={symbol}
              type="monotone"
              dataKey={symbol}
              name={symbol}
              stroke={colorBySymbol.get(symbol)}
              strokeWidth={2}
              dot={false}
              // Bridge missing days. On a shared calendar axis the gaps are
              // mostly weekends and holidays: crypto has a bar every day,
              // equities do not, so leaving them unconnected shattered every
              // equity line into daily fragments while BTC drew solid. Joining
              // Friday's close to Monday's is the actual price path, and how
              // every equity chart is drawn.
              // ponytail: a genuinely long outage gets bridged too - acceptable
              // until the ingest layer records outages distinctly from weekends.
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {missing.length > 0 && (
        <p className="mt-2.5 text-caption text-dim">
          No price history inside this window for {missing.join(", ")} - widen the timeframe to plot{" "}
          {missing.length === 1 ? "it" : "them"}.
        </p>
      )}
    </div>
  );
}
