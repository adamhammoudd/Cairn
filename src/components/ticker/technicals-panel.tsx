"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_TOOLTIP, CHART_AXIS_TICK, CHART_GRID } from "@/lib/chart-theme";
import { sma, ema, rsi, macd, INDICATOR_COLOURS } from "@/lib/indicators";
import { DataFreshness } from "@/components/data-freshness";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";

// Technical overlays computed from the daily closes already in the trend
// store - no extra provider call, and the same numbers the chart is drawn
// from. Every overlay is null-padded to the bar index, so a 200-day average
// starts on the 200th bar rather than at the left edge.

const WINDOWS = [
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "ALL", days: Infinity },
] as const;

interface TechnicalsPanelProps {
  symbol: string;
  bars: { ts: string; close: number | null }[];
  priceSource: "live" | "last_close";
  priceAsOf: string | null;
  /** Annualised stdev of the last 30 daily returns, in percent, from loadTicker(). */
  volatility30d?: number | null;
}

// The mock's "Indicators" list: one row per reading, with what it is in words
// beside the number. Every value is read off the same series the charts below
// are drawn from - this is a summary of them, not a second computation.
//
// The state chip is descriptive, never directional: the accent marks a price
// above its own average, amber marks a reading outside a conventional band,
// and nothing here is coloured with the loss red, which the brand reserves for
// actual losses.
function IndicatorRow({
  label,
  desc,
  value,
  state,
  tone,
}: {
  label: string;
  desc: string;
  value: string;
  state: string;
  tone: "accent" | "warning" | "neutral";
}) {
  const colour = tone === "accent" ? "text-accent-light" : tone === "warning" ? "text-warning" : "text-primary";
  const dot = tone === "accent" ? "bg-accent" : tone === "warning" ? "bg-warning" : "bg-line-strong";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft px-5 py-4 transition-colors duration-base ease-standard last:border-b-0 hover:bg-active">
      <div className="min-w-0 flex-[1_1_260px]">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`h-[5px] w-[5px] shrink-0 rounded-full ${dot}`} />
          <span className="text-body font-semibold text-primary">{label}</span>
        </div>
        <p className="mt-1.5 ml-[13px] max-w-[520px] text-caption leading-[1.5] text-muted text-pretty">{desc}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`font-mono text-lead tabular-nums ${colour}`}>{value}</span>
        <span className="rounded-control border border-line bg-active px-2.5 py-1 font-mono text-eyebrow text-muted uppercase">
          {state}
        </span>
      </div>
    </div>
  );
}

const OVERLAYS = [
  { id: "sma50", label: "SMA 50", colour: INDICATOR_COLOURS.sma },
  { id: "sma200", label: "SMA 200", colour: "var(--color-violet)" },
  { id: "ema20", label: "EMA 20", colour: INDICATOR_COLOURS.ema },
] as const;
type OverlayId = (typeof OVERLAYS)[number]["id"];

export function TechnicalsPanel({ symbol, bars, priceSource, priceAsOf, volatility30d = null }: TechnicalsPanelProps) {
  const [windowLabel, setWindowLabel] = useState<(typeof WINDOWS)[number]["label"]>("1Y");
  const [enabled, setEnabled] = useState<Record<OverlayId, boolean>>({ sma50: true, sma200: true, ema20: false });

  // Indicators are computed over the WHOLE series and only then sliced to the
  // visible window. Computing them over the slice would restart a 200-day
  // average at the left edge of a 1-year view and draw a line that is simply
  // not the 200-day average.
  const full = useMemo(() => {
    const clean = bars
      .filter((b): b is { ts: string; close: number } => b.close !== null)
      .map((b) => ({ ts: b.ts, close: Number(b.close) }))
      .sort((a, b) => (a.ts < b.ts ? -1 : 1));
    const closes = clean.map((b) => b.close);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const ema20 = ema(closes, 20);
    const rsi14 = rsi(closes, 14);
    const { macd: macdLine, signal, histogram } = macd(closes);
    return clean.map((b, i) => ({
      ts: b.ts,
      close: b.close,
      sma50: sma50[i],
      sma200: sma200[i],
      ema20: ema20[i],
      rsi: rsi14[i],
      macd: macdLine[i],
      signal: signal[i],
      histogram: histogram[i],
    }));
  }, [bars]);

  const points = useMemo(() => {
    const days = WINDOWS.find((w) => w.label === windowLabel)?.days ?? 365;
    if (!Number.isFinite(days) || full.length === 0) return full;
    const last = new Date(full[full.length - 1].ts);
    last.setDate(last.getDate() - days);
    const cutoff = last.toISOString().slice(0, 10);
    return full.filter((p) => p.ts >= cutoff);
  }, [full, windowLabel]);

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const tickFormat = (v: string) => {
    const [, m, d] = v.split("-");
    return `${d}/${m}`;
  };
  // Was hardcoded `currency: "USD"` - the price-overlay axis/tooltip (SMA/EMA
  // lines are price, same units as the headline number) didn't follow
  // Settings > Display > Primary currency like the rest of the Ticker page.
  const prefs = useDisplayPrefs();
  const money = (n: number) => formatMoney(n, prefs);
  // Wide enough for the longest price label: at a fixed 62px, a coin's
  // "$115,517.88" was cut at the chart's left edge on a phone.
  const priceAxisWidth = useMemo(() => {
    const closes = points.map((p) => p.close).filter((c): c is number => typeof c === "number");
    const longest = closes.length ? Math.max(money(Math.max(...closes)).length, money(Math.min(...closes)).length) : 0;
    return Math.max(62, longest * 6 + 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, prefs]);

  // A window shorter than an indicator's period has no value to draw, and the
  // reader is told which rather than shown an empty axis.
  const undefinedOverlays = OVERLAYS.filter(
    (o) => enabled[o.id] && points.every((p) => p[o.id] === null),
  ).map((o) => o.label);

  if (full.length === 0) {
    return (
      <div className="rounded-card border border-line bg-panel p-10 text-center text-lead text-muted">
        No price history stored for {symbol}, so no indicator can be computed. Nothing is drawn rather than a flat line.
      </div>
    );
  }

  // Peak close over the window on screen, so the drawdown row and the chart
  // above it are describing the same stretch of history.
  const windowHigh = points.reduce<number | null>((hi, p) => (hi === null || p.close > hi ? p.close : hi), null);
  const drawdown =
    latest && windowHigh && windowHigh > 0 ? ((latest.close - windowHigh) / windowHigh) * 100 : null;

  const indicators: { label: string; desc: string; value: string; state: string; tone: "accent" | "warning" | "neutral" }[] = [];
  for (const [key, label, desc] of [
    ["sma50", "SMA 50", "Fifty-session simple moving average of daily closes."],
    ["sma200", "SMA 200", "Two-hundred-session average. Crossovers can trigger an alert on the Alerts page."],
  ] as const) {
    const v = latest === null ? null : latest[key];
    if (v === null || v === undefined || latest === null) continue;
    const above = latest.close >= v;
    indicators.push({
      label,
      desc,
      value: money(v),
      state: above ? "Price above" : "Price below",
      tone: above ? "accent" : "neutral",
    });
  }
  if (latest?.rsi !== null && latest?.rsi !== undefined) {
    // 70/30 are the conventional overbought/oversold bands, the same ones the
    // RSI chart below draws as reference lines. A band, not a call.
    const band = latest.rsi >= 70 ? "Overbought" : latest.rsi <= 30 ? "Oversold" : "Neutral";
    indicators.push({
      label: "RSI 14",
      desc: "Relative strength over fourteen sessions. Above 70 and below 30 are the conventional bands.",
      value: latest.rsi.toFixed(1),
      state: band,
      tone: band === "Neutral" ? "neutral" : "warning",
    });
  }
  if (volatility30d !== null) {
    indicators.push({
      label: "Volatility 30d",
      desc: "Annualised standard deviation of the last thirty daily returns.",
      value: `${volatility30d.toFixed(0)}%`,
      // 30% annualised is the conventional dividing line between an ordinary
      // and an elevated reading. It is a convention this row names, not a
      // threshold Cairn computes or acts on.
      state: volatility30d >= 30 ? "Elevated" : "Ordinary",
      tone: volatility30d >= 30 ? "warning" : "neutral",
    });
  }
  if (drawdown !== null) {
    indicators.push({
      label: `Drawdown from ${windowLabel} high`,
      desc: "Distance from the highest close in the window the charts below are drawn over.",
      value: `${drawdown > 0 ? "+" : drawdown < 0 ? "−" : ""}${Math.abs(drawdown).toFixed(1)}%`,
      state: `Peak ${money(windowHigh ?? 0)}`,
      tone: "neutral",
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      {indicators.length > 0 && (
        <div className="animate-rise-in overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5 border-b border-line-soft bg-gradient-to-b from-accent/[0.06] to-transparent px-5 py-4">
            <h2 className="font-serif text-h3 font-normal text-primary">Indicators</h2>
            <span className="text-caption text-dim">Computed in code from daily closes - not model output</span>
          </div>
          {indicators.map((i) => (
            <IndicatorRow key={i.label} {...i} />
          ))}
          <div className="border-t border-line-soft px-5 py-3.5 text-caption leading-[1.55] text-dim text-pretty">
            Indicator values describe past price behaviour. They are inputs to an analysis, not signals, and Cairn does
            not resolve them into a decision.
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-panel border border-line p-1">
              {WINDOWS.map((w) => (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setWindowLabel(w.label)}
                  className={`rounded-control px-3 py-1.5 font-mono text-micro transition-colors duration-base ease-standard ${
                    windowLabel === w.label ? "bg-active text-primary" : "text-muted hover:text-primary"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {OVERLAYS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={enabled[o.id]}
                  onClick={() => setEnabled((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
                  className={`flex items-center gap-2 rounded-control border px-2.5 py-1 font-mono text-micro transition-colors duration-base ease-standard ${
                    enabled[o.id] ? "border-line-strong text-primary" : "border-line text-dim hover:text-muted"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-0.5 w-3.5 rounded-full"
                    style={{ background: enabled[o.id] ? o.colour : "var(--color-line-strong)" }}
                  />
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <DataFreshness source={priceSource} asOf={priceAsOf} detail="daily closes" />
        </div>

        <div className="px-2 pt-3.5 pb-2">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="ts" tickFormatter={tickFormat} minTickGap={48} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin", "dataMax"]} width={priceAxisWidth} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => money(Number(v))} />
              <Tooltip
                {...CHART_TOOLTIP}
                formatter={(value, name) => [money(Number(value)), String(name)] as [string, string]}
                labelFormatter={(l) => new Date(String(l)).toLocaleDateString()}
              />
              <Line type="monotone" dataKey="close" name="Close" stroke="var(--color-accent)" strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls={false} />
              {OVERLAYS.filter((o) => enabled[o.id]).map((o) => (
                <Line
                  key={o.id}
                  type="monotone"
                  dataKey={o.id}
                  name={o.label}
                  stroke={o.colour}
                  strokeWidth={1.25}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          {undefinedOverlays.length > 0 && (
            <p className="px-2 pb-1 text-caption text-dim">
              {undefinedOverlays.join(" and ")} {undefinedOverlays.length > 1 ? "have" : "has"} no value over this
              window - the average needs more bars than the window contains. Widen the range to draw{" "}
              {undefinedOverlays.length > 1 ? "them" : "it"}.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 min-[1000px]:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-mono text-eyebrow text-muted uppercase">RSI (14)</span>
            <span className="font-mono text-micro tabular-nums text-primary">
              {latest?.rsi === null || latest?.rsi === undefined ? "-" : latest.rsi.toFixed(1)}
            </span>
          </div>
          <div className="px-2 pt-3 pb-2">
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="ts" tickFormatter={tickFormat} minTickGap={48} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} width={34} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v) => [Number(v).toFixed(1), "RSI"] as [string, string]} labelFormatter={(l) => new Date(String(l)).toLocaleDateString()} />
                {/* 70/30 are the conventional overbought/oversold bands. Drawn
                    in neutral grey, not green/red: this is a level, not a gain
                    or a loss, and the brand reserves red for losses. */}
                <ReferenceLine y={70} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="rsi" name="RSI" stroke={INDICATOR_COLOURS.rsi} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="px-4 pb-3.5 text-caption text-dim">
            Wilder&rsquo;s 14-period RSI over stored daily closes. Above 70 and below 30 are the conventional
            overbought/oversold bands - a level, not a recommendation.
          </p>
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-mono text-eyebrow text-muted uppercase">MACD (12, 26, 9)</span>
            <span className="font-mono text-micro tabular-nums text-primary">
              {latest?.macd === null || latest?.macd === undefined ? "-" : latest.macd.toFixed(2)}
            </span>
          </div>
          <div className="px-2 pt-3 pb-2">
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="ts" tickFormatter={tickFormat} minTickGap={48} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis width={44} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => Number(v).toFixed(1)} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v, n) => [Number(v).toFixed(2), String(n)] as [string, string]} labelFormatter={(l) => new Date(String(l)).toLocaleDateString()} />
                <ReferenceLine y={0} stroke="var(--color-line-strong)" />
                <Bar dataKey="histogram" name="Histogram" fill="var(--color-line)" isAnimationActive={false} />
                <Line type="monotone" dataKey="macd" name="MACD" stroke={INDICATOR_COLOURS.macd} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="signal" name="Signal" stroke={INDICATOR_COLOURS.signal} strokeWidth={1.25} dot={false} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="px-4 pb-3.5 text-caption text-dim">
            12/26 EMA difference with a 9-period signal line; the bars are the gap between them. Both EMAs are
            SMA-seeded, so the first value appears on the 26th bar rather than the first.
          </p>
        </div>
      </div>
    </div>
  );
}
