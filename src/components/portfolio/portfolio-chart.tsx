"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { xAxisConfig, type TimelinePoint } from "@/lib/portfolio";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

interface PortfolioChartProps {
  seriesByTimeframe: Record<ChartView, TimelinePoint[]>;
  hasHoldings: boolean;
}

export function PortfolioChart({ seriesByTimeframe, hasHoldings }: PortfolioChartProps) {
  const [timeframe, setTimeframe] = useState<ChartView>("1M");
  const points = seriesByTimeframe[timeframe];
  const { interval, tickFormatter } = useMemo(() => xAxisConfig(points, timeframe), [points, timeframe]);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-[#1E1E1E] px-4 py-3">
        <div className="flex gap-1 rounded-[10px] border border-[#232323] p-0.75">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded-[7px] px-3 py-1.5 font-mono text-[11px] transition-colors duration-base ease-standard hover:text-primary ${
                timeframe === tf ? "bg-[#1C1C1C] text-primary" : "text-muted"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">Combined holdings value</span>
      </div>

      <div className="px-2 pt-3.5 pb-2">
      {!hasHoldings ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted">
          Add a holding to see portfolio performance.
        </div>
      ) : points.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted">
          {timeframe === "1D"
            ? "Intraday data isn't available yet — only daily closes are ingested."
            : "No price history for this range yet."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2FC685" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#2FC685" stopOpacity={0} />
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
              formatter={(value) => [Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" }), "Close"] as [string, string]}
              labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
              contentStyle={{ background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8A8A8A" }}
            />
            <Area type="monotone" dataKey="value" stroke="#2FC685" strokeWidth={2} fill="url(#portfolioFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      </div>
    </div>
  );
}
