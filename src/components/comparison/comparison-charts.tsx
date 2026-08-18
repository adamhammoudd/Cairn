"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { xAxisConfig } from "@/lib/portfolio";
import { buildPriceSeries } from "@/lib/ticker";
import { COMPARISON_COLORS, type ComparisonRow } from "@/lib/comparison";
import type { ChartView } from "@/lib/supabase/types";

function MiniChart({ row, timeframe, color }: { row: ComparisonRow; timeframe: ChartView; color: string }) {
  const points = useMemo(() => buildPriceSeries(row.bars, timeframe), [row.bars, timeframe]);
  const { interval, tickFormatter } = useMemo(() => xAxisConfig(points, timeframe), [points, timeframe]);
  const gradientId = `compareFill-${row.symbol}`;

  return (
    <div>
      <div>
        <span>{row.symbol}</span>
        <span

 >
          {row.changePct === null ? "—" : `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`}
        </span>
      </div>
      {points.length === 0 ? (
        <div>No price history.</div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart syncId="comparison-timeline" data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              interval={interval}
              tickFormatter={tickFormatter}
              tickLine={false}
              minTickGap={20}
 />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" })}
              labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
 />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function ComparisonCharts({ rows, timeframe }: { rows: ComparisonRow[]; timeframe: ChartView }) {
  return (
    <div>
      {rows.map((row, i) => (
        <MiniChart key={row.symbol} row={row} timeframe={timeframe} color={COMPARISON_COLORS[i % COMPARISON_COLORS.length]} />
      ))}
    </div>
  );
}
