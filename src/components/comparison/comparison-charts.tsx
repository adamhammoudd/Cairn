"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { xAxisConfig } from "@/lib/portfolio";
import { buildPriceSeries } from "@/lib/ticker";
import type { ComparisonRow } from "@/lib/comparison";
import type { ChartView } from "@/lib/supabase/types";

// Token-only palette (accent scale + neutrals) — the prior blue/gold/purple
// set introduced hues outside the brand guide without design-lead sign-off.
const COLORS = ["#2FC685", "#5EE6A6", "#8A8A8A", "#6A6A6A"];

function MiniChart({ row, timeframe, color }: { row: ComparisonRow; timeframe: ChartView; color: string }) {
  const points = useMemo(() => buildPriceSeries(row.bars, timeframe), [row.bars, timeframe]);
  const { interval, tickFormatter } = useMemo(() => xAxisConfig(points, timeframe), [points, timeframe]);
  const gradientId = `compareFill-${row.symbol}`;

  return (
    <div className="rounded-card border border-line bg-panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-primary">{row.symbol}</span>
        <span
          className={`text-[12px] ${row.changePct === null ? "text-muted" : row.changePct >= 0 ? "text-accent" : "text-negative"}`}
        >
          {row.changePct === null ? "—" : `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`}
        </span>
      </div>
      {points.length === 0 ? (
        <div className="flex h-[140px] items-center justify-center text-[12px] text-muted">No price history.</div>
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
              tick={{ fill: "#8A8A8A", fontSize: 10 }}
              axisLine={{ stroke: "#2A2A2A" }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" })}
              labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
              contentStyle={{ background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8A8A8A" }}
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
    <div className="grid grid-cols-2 gap-4">
      {rows.map((row, i) => (
        <MiniChart key={row.symbol} row={row} timeframe={timeframe} color={COLORS[i % COLORS.length]} />
      ))}
    </div>
  );
}
