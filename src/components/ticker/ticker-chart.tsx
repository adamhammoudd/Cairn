"use client";

import { useMemo, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildPriceSeries } from "@/lib/ticker";
import { xAxisConfig } from "@/lib/portfolio";
import { formatTooltipLabel } from "@/lib/chart-dates";
import { DataFreshness } from "@/components/data-freshness";
import { getIntradaySeries } from "@/lib/actions/intraday";
import type { IntradayResult } from "@/lib/intraday-window";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";
import type { ChartView } from "@/lib/supabase/types";

const TIMEFRAMES: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

interface TickerChartProps {
  symbol: string;
  bars: { ts: string; close: number | null }[];
  /** Drives the card label the mock shows where it reads "Delayed 15m". */
  priceSource?: "live" | "last_close";
  /** Date of the most recent bar, for the same label. */
  priceAsOf?: string | null;
}

export function TickerChart({ symbol, bars, priceSource = "last_close", priceAsOf = null }: TickerChartProps) {
  // Settings > Display > "Default chart timeframe", whose hint has always read
  // "Applied when opening a ticker". Until now this was hard-coded to 3M and
  // the setting was written by the form and read by nothing, so the hint
  // described behaviour the component did not have.
  const prefs = useDisplayPrefs();
  const [timeframe, setTimeframe] = useState<ChartView>(prefs.defaultChartView);
  // 1D and 1W plot provider bars (1 min / 15 min); the rest are daily closes.
  const [intraday, setIntraday] = useState<IntradayResult | null>(null);
  const [loadingIntraday, setLoadingIntraday] = useState(false);
  const isIntraday = timeframe === "1D" || timeframe === "1W";

  // Started from the range button rather than an effect, so switching ranges
  // never triggers a cascading re-render.
  const requestId = useRef(0);

  function selectTimeframe(next: ChartView) {
    setTimeframe(next);
    if (next !== "1D" && next !== "1W") {
      setIntraday(null);
      return;
    }

    const id = ++requestId.current;
    setLoadingIntraday(true);
    setIntraday(null);
    getIntradaySeries(symbol, next)
      .then((res) => {
        if (id === requestId.current) setIntraday(res);
      })
      .finally(() => {
        if (id === requestId.current) setLoadingIntraday(false);
      });
  }

  const daily = useMemo(() => buildPriceSeries(bars, timeframe), [bars, timeframe]);
  const intradayPoints = isIntraday && intraday?.points.length ? intraday.points : null;
  const points = intradayPoints ?? (timeframe === "1D" ? [] : daily);
  // Coloured by the move the chart actually draws, not by today's change. A 1Y
  // view of a stock down 30% over the year was rendering green because the
  // last session happened to close up - green here has to mean "this line is
  // up over this window", the same thing red means on every other surface.
  const rangeChange = points.length > 1 ? points[points.length - 1].value - points[0].value : 0;
  const color = rangeChange >= 0 ? "#2FC685" : "#D96C6C";

  // Per-timeframe X-axis, same helper the Compare page uses: tick spacing that
  // never overlaps and a label format matched to the window.
  const { interval, tickFormatter } = xAxisConfig(points, timeframe);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-line p-0.75">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => selectTimeframe(tf)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[11px] transition-colors duration-base ease-standard ${
                timeframe === tf ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {intradayPoints ? (
          // Market closed: the intraday feed anchors on the last session, so
          // the label reads "as of <that date>" rather than "Live".
          intraday?.stale ? (
            <DataFreshness
              source="last_close"
              asOf={intraday.asOf}
              detail={timeframe === "1D" ? "1 min bars" : "15 min bars"}
            />
          ) : (
            <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
              {timeframe === "1D" ? "Live · 1 min bars" : "Live · 15 min bars"}
            </span>
          )
        ) : (
          <DataFreshness source={priceSource} asOf={priceAsOf} detail="daily closes" />
        )}
      </div>

      <div className="px-2 pt-3.5 pb-2">
        {loadingIntraday && points.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted">Loading intraday prices…</div>
        ) : points.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-muted">
            {isIntraday
              ? "No intraday bars for this range - the market may not have opened yet, or the provider has nothing for this symbol."
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
              tick={{ fill: "#8A8A8A", fontSize: 10 }}
              axisLine={{ stroke: "#2A2A2A" }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              formatter={(value) => [formatMoney(Number(value), prefs), "Close"] as [string, string]}
              labelFormatter={(label) => formatTooltipLabel(String(label))}
              contentStyle={{ background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8A8A8A" }}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#tickerFill)" isAnimationActive={false} />
          </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
