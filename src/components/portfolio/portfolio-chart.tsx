"use client";

import { useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP, CHART_AXIS_TICK } from "@/lib/chart-theme";
import { xAxisConfig, type TimelinePoint } from "@/lib/portfolio";
import { formatTooltipLabel } from "@/lib/chart-dates";
import { getIntradayPortfolioSeries } from "@/lib/actions/intraday";
import type { IntradayResult } from "@/lib/intraday-window";
import type { ChartView } from "@/lib/supabase/types";
import { DataFreshness } from "@/components/data-freshness";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

interface PortfolioChartProps {
  seriesByTimeframe: Record<ChartView, TimelinePoint[]>;
  hasHoldings: boolean;
  /** Date of the newest close behind the series, for the freshness label. */
  asOf?: string | null;
}

export function PortfolioChart({ seriesByTimeframe, hasHoldings, asOf = null }: PortfolioChartProps) {
  // Opens on Settings > Display > "Default chart timeframe", same as the
  // ticker chart. Base Camp's summary sparkline stays pinned to 1M - it plots
  // from the daily series with no intraday path, so it cannot honour a 1D or
  // 1W default; see DASHBOARD_SPARKLINE_TIMEFRAME in app/(app)/page.tsx.
  const prefs = useDisplayPrefs();
  const [timeframe, setTimeframe] = useState<ChartView>(prefs.defaultChartView);
  // 1D and 1W come from the live provider (minute and quarter-hour bars);
  // every other range is the daily series computed on the server.
  const [intraday, setIntraday] = useState<IntradayResult | null>(null);
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
  const color = positive ? "var(--color-accent)" : "var(--color-negative)";

  // Per-timeframe X-axis: tick spacing that never overlaps, and a label format
  // matched to the window (hour for 1D, weekday for 1W, ... month+year for
  // ALL). Shared helper - the Compare page's chart uses the same one.
  const { interval, tickFormatter } = xAxisConfig(points, timeframe);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="flex gap-1 rounded-panel border border-line p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => selectTimeframe(tf)}
              className={`rounded-control px-3 py-1.5 font-mono text-micro transition-colors duration-base ease-standard hover:text-primary ${
                timeframe === tf ? "bg-active text-primary" : "text-muted"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {intradayPoints ? (
          intraday?.stale ? (
            <DataFreshness
              source="last_close"
              asOf={intraday.asOf}
              detail={timeframe === "1D" ? "combined value · 1 min" : "combined value · 15 min"}
            />
          ) : (
            <span className="font-mono text-eyebrow text-dim uppercase">
              {timeframe === "1D" ? "Combined value · 1 min" : "Combined value · 15 min"}
            </span>
          )
        ) : (
          <DataFreshness source="last_close" asOf={asOf} detail="combined holdings value" />
        )}
      </div>

      <div className="px-2 pt-3.5 pb-2">
      {!hasHoldings ? (
        <div className="flex h-[200px] items-center justify-center text-lead text-muted">
          Add a holding to see portfolio performance.
        </div>
      ) : loadingIntraday && points.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-lead text-muted">Loading intraday prices…</div>
      ) : points.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center px-6 text-center text-lead text-muted">
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
            <XAxis
              dataKey="date"
              interval={interval}
              tickFormatter={tickFormatter}
              tick={CHART_AXIS_TICK}
              axisLine={{ stroke: "var(--color-line)" }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              formatter={(value) => [formatMoney(Number(value), prefs), "Close"] as [string, string]}
              labelFormatter={(label) => formatTooltipLabel(String(label))}
              {...CHART_TOOLTIP}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#portfolioFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      </div>
    </div>
  );
}
