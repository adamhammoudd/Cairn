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
    <div>
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

      {!hasHoldings ? (
        <div>
          Add a holding to see portfolio performance.
        </div>
      ) : points.length === 0 ? (
        <div>
          {timeframe === "1D"
            ? "Intraday data isn't available yet — only daily closes are ingested."
            : "No price history for this range yet."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#666666" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#666666" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              interval={interval}
              tickFormatter={tickFormatter}
              tickLine={false}
              minTickGap={24}
 />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" })}
              labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
 />
            <Area type="monotone" dataKey="value" stroke="#666666" strokeWidth={2.5} fill="url(#portfolioFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
