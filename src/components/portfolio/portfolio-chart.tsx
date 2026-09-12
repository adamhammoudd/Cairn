"use client";

import { useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP, CHART_AXIS_TICK, paddedDomain } from "@/lib/chart-theme";
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
  /**
   * Held symbols with no stored price history. They contribute nothing to the
   * line, so the header names them rather than letting the chart read as the
   * whole portfolio - see timelineCoverage() in lib/portfolio.ts.
   */
  missingHistory?: string[];
  /** Total held positions, so the header can say "2 of 4". */
  positionCount?: number;
}

export function PortfolioChart({
  seriesByTimeframe,
  hasHoldings,
  asOf = null,
  missingHistory = [],
  positionCount = 0,
}: PortfolioChartProps) {
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
    <div
      className="relative overflow-hidden rounded-2xl border border-[#232323] px-[22px] py-5"
      style={{ background: "linear-gradient(180deg,#111010,#0d0d0d)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          inset: "-60% 55% 45% -12%",
          background: "radial-gradient(closest-side, rgba(217,108,108,.15), transparent)",
          animation: "cn-glow 7s ease-in-out infinite",
        }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-[3px] rounded-[10px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => selectTimeframe(tf)}
              className={`rounded-[7px] px-3 py-1.5 font-mono text-micro transition-colors duration-base ease-standard hover:text-primary ${
                timeframe === tf ? "bg-[#1e1e1e] text-primary" : "text-dim"
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
          <DataFreshness
            source="last_close"
            asOf={asOf}
            detail={
              missingHistory.length > 0 && positionCount > 0
                ? `${positionCount - missingHistory.length} of ${positionCount} positions`
                : "combined holdings value"
            }
          />
        )}
      </div>

      {/* A position with no stored bars adds nothing on any date, so the line
          is a subset of the portfolio - and said so nowhere, which is how a
          EUR 146 account came to be shown a chart topping out near EUR 74.
          Naming the gap is the honest option: the alternative is carrying a
          current price backwards as flat history, and this product does not
          invent prices it does not have. */}
      {missingHistory.length > 0 && (
        <div className="relative mt-3.5 flex items-start gap-2.5 rounded-[11px] border border-[#2a2418] bg-warning/[0.07] px-3.5 py-[11px] text-[12.5px] leading-[1.55] text-[#c8c0ad] text-pretty">
          <span aria-hidden className="w-[3px] flex-none self-stretch rounded-xs bg-warning" />
          <span>
          Not in this line:{" "}
          <span className="text-primary">{missingHistory.join(", ")}</span> &middot; no stored price
          history yet, so {missingHistory.length === 1 ? "it contributes" : "they contribute"} nothing to
          the plotted value. The totals above still include{" "}
          {missingHistory.length === 1 ? "it" : "them"}.
          </span>
        </div>
      )}

      <div className="relative pt-4">
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
            {/* Same fix as the ticker chart: a hidden axis over a dataMin/
                dataMax domain drew every portfolio as a full-height mountain
                with no values on it. See paddedDomain() for why the padding
                matters. */}
            <YAxis
              width={68}
              domain={paddedDomain(points.map((p) => p.value))}
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatMoney(Number(v), prefs)}
            />
            <Tooltip
              formatter={(value) => [formatMoney(Number(value), prefs), "Value"] as [string, string]}
              labelFormatter={(label) => formatTooltipLabel(String(label))}
              {...CHART_TOOLTIP}
            />
            <Area type="linear" dataKey="value" stroke={color} strokeWidth={2} fill="url(#portfolioFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      </div>
    </div>
  );
}
