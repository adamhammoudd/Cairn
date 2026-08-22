"use client";

import { useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { TimelinePoint } from "@/lib/portfolio";
import { getIntradayPortfolioSeries } from "@/lib/actions/intraday";
import type { ChartView } from "@/lib/supabase/types";
import { DataFreshness } from "@/components/data-freshness";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

interface PortfolioChartProps {
  seriesByTimeframe: Record<ChartView, TimelinePoint[]>;
  hasHoldings: boolean;
  /** Date of the newest close behind the series, for the freshness label. */
  asOf?: string | null;
}

export function PortfolioChart({ seriesByTimeframe, hasHoldings, asOf = null }: PortfolioChartProps) {
  const [timeframe, setTimeframe] = useState<ChartView>("1M");
  // 1D and 1W come from the live provider (minute and quarter-hour bars);
  // every other range is the daily series computed on the server.
  const [intraday, setIntraday] = useState<{ points: TimelinePoint[]; available: boolean } | null>(null);
  const [loadingIntraday, setLoadingIntraday] = useState(false);
  const isIntraday = timeframe === "1D" || timeframe === "1W";

  // Fetched from the click rather than an effect: the range button is the
  // only thing that can start this, and firing it here keeps the render pass
  // free of cascading state updates.
  const requestId = useRef(0);

  function selectTimeframe(next: ChartView) {
    setTimeframe(next);
    if (next !== "1D" && next !== "1W") {
      setIntraday(null);
      return;
    }
    if (!hasHoldings) return;

    const id = ++requestId.current;
    setLoadingIntraday(true);
    setIntraday(null);
    getIntradayPortfolioSeries(next)
      .then((res) => {
        if (id === requestId.current) setIntraday(res);
      })
      .finally(() => {
        if (id === requestId.current) setLoadingIntraday(false);
      });
  }

  const intradayPoints = isIntraday && intraday?.points.length ? intraday.points : null;
  const points = intradayPoints ?? (timeframe === "1D" ? [] : seriesByTimeframe[timeframe]);

  // The line and its fill were hardcoded to the accent green whatever the
  // portfolio did over the selected window - a portfolio down 12% on the year
  // still drew green, in a product where red means loss and nothing else.
  const rangeChange = points.length > 1 ? points[points.length - 1].value - points[0].value : 0;
  const positive = rangeChange >= 0;
  const color = positive ? "#2FC685" : "#D96C6C";

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-[#1E1E1E] px-4 py-3">
        <div className="flex gap-1 rounded-[10px] border border-[#232323] p-0.75">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => selectTimeframe(tf)}
              className={`rounded-[7px] px-3 py-1.5 font-mono text-[11px] transition-colors duration-base ease-standard hover:text-primary ${
                timeframe === tf ? "bg-[#1C1C1C] text-primary" : "text-muted"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {intradayPoints ? (
          <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
            {timeframe === "1D" ? "Combined value · 1 min" : "Combined value · 15 min"}
          </span>
        ) : (
          <DataFreshness source="last_close" asOf={asOf} detail="combined holdings value" />
        )}
      </div>

      <div className="px-2 pt-3.5 pb-2">
      {!hasHoldings ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted">
          Add a holding to see portfolio performance.
        </div>
      ) : loadingIntraday && points.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted">Loading intraday prices…</div>
      ) : points.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center px-6 text-center text-sm text-muted">
          {timeframe === "1D"
            ? "Intraday isn't available on this deployment - stored prices are one close per day, so an intraday view would draw a straight line between yesterday and today rather than a real session."
            : isIntraday
              ? "No intraday bars returned for this range."
              : "No price history for this range yet."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              formatter={(value) => [Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" }), "Close"] as [string, string]}
              labelFormatter={(label) =>
                String(label).length > 10
                  ? new Date(String(label)).toLocaleString()
                  : new Date(String(label)).toLocaleDateString()
              }
              contentStyle={{ background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8A8A8A" }}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#portfolioFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      </div>
    </div>
  );
}
