"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { xAxisConfig } from "@/lib/portfolio";
import { buildPriceSeries } from "@/lib/ticker";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

interface TickerChartProps {
  bars: { ts: string; close: number | null }[];
  positive: boolean;
}

export function TickerChart({ bars, positive }: TickerChartProps) {
  const [timeframe, setTimeframe] = useState<ChartView>("3M");
  const points = useMemo(() => buildPriceSeries(bars, timeframe), [bars, timeframe]);
  const { interval, tickFormatter } = useMemo(() => xAxisConfig(points, timeframe), [points, timeframe]);
  const color = positive ? "#2FC685" : "#D96C6C";

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-line p-0.75">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[11px] transition-colors duration-base ease-standard ${
                timeframe === tf ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">Daily closes</span>
      </div>

      <div className="px-2 pt-3.5 pb-2">
        {points.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center px-4 text-center text-sm text-muted">
            {timeframe === "1D"
              ? "Intraday data isn't available yet — only daily closes are ingested."
              : "No price history for this range yet."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tickerFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              interval={interval}
              tickFormatter={tickFormatter}
              tick={{ fill: "#8A8A8A", fontSize: 11 }}
              axisLine={{ stroke: "#2A2A2A" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" })}
              labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
              contentStyle={{ background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8A8A8A" }}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#tickerFill)" />
          </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
