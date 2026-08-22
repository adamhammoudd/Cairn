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
import { sma, ema, rsi, macd, INDICATOR_COLOURS } from "@/lib/indicators";
import { DataFreshness } from "@/components/data-freshness";

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
}

const OVERLAYS = [
  { id: "sma50", label: "SMA 50", colour: INDICATOR_COLOURS.sma },
  { id: "sma200", label: "SMA 200", colour: "#7A6CC4" },
  { id: "ema20", label: "EMA 20", colour: INDICATOR_COLOURS.ema },
] as const;
type OverlayId = (typeof OVERLAYS)[number]["id"];

export function TechnicalsPanel({ symbol, bars, priceSource, priceAsOf }: TechnicalsPanelProps) {
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
  const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  const tooltip = {
    contentStyle: { background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 },
    labelStyle: { color: "#8A8A8A" },
  };

  // A window shorter than an indicator's period has no value to draw, and the
  // reader is told which rather than shown an empty axis.
  const undefinedOverlays = OVERLAYS.filter(
    (o) => enabled[o.id] && points.every((p) => p[o.id] === null),
  ).map((o) => o.label);

  if (full.length === 0) {
    return (
      <div className="rounded-card border border-line bg-panel p-10 text-center text-sm text-muted">
        No price history stored for {symbol}, so no indicator can be computed. Nothing is drawn rather than a flat line.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="overflow-hidden rounded-card border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl border border-line p-0.75">
              {WINDOWS.map((w) => (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setWindowLabel(w.label)}
                  className={`rounded-lg px-3 py-1.5 font-mono text-[11px] transition-colors duration-base ease-standard ${
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
                  className={`flex items-center gap-1.75 rounded-lg border px-2.5 py-1.25 font-mono text-[10.5px] transition-colors duration-base ease-standard ${
                    enabled[o.id] ? "border-[#3A3A3A] text-primary" : "border-line text-dim hover:text-muted"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-0.5 w-3.5 rounded-full"
                    style={{ background: enabled[o.id] ? o.colour : "#3A3A3A" }}
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
              <CartesianGrid stroke="#1C1C1C" vertical={false} />
              <XAxis dataKey="ts" tickFormatter={tickFormat} minTickGap={48} tick={{ fill: "#5A5A5A", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin", "dataMax"]} width={62} tick={{ fill: "#5A5A5A", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => money(Number(v))} />
              <Tooltip
                {...tooltip}
                formatter={(value, name) => [money(Number(value)), String(name)] as [string, string]}
                labelFormatter={(l) => new Date(String(l)).toLocaleDateString()}
              />
              <Line type="monotone" dataKey="close" name="Close" stroke="#2FC685" strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls={false} />
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
            <p className="px-2 pb-1 text-[11.5px] text-dim">
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
            <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">RSI (14)</span>
            <span className="font-mono text-[11px] tabular-nums text-primary">
              {latest?.rsi === null || latest?.rsi === undefined ? "-" : latest.rsi.toFixed(1)}
            </span>
          </div>
          <div className="px-2 pt-3 pb-2">
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1C1C1C" vertical={false} />
                <XAxis dataKey="ts" tickFormatter={tickFormat} minTickGap={48} tick={{ fill: "#5A5A5A", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} width={34} tick={{ fill: "#5A5A5A", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} formatter={(v) => [Number(v).toFixed(1), "RSI"] as [string, string]} labelFormatter={(l) => new Date(String(l)).toLocaleDateString()} />
                {/* 70/30 are the conventional overbought/oversold bands. Drawn
                    in neutral grey, not green/red: this is a level, not a gain
                    or a loss, and the brand reserves red for losses. */}
                <ReferenceLine y={70} stroke="#3A3A3A" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="#3A3A3A" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="rsi" name="RSI" stroke={INDICATOR_COLOURS.rsi} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="px-4 pb-3.5 text-[11.5px] text-dim">
            Wilder&rsquo;s 14-period RSI over stored daily closes. Above 70 and below 30 are the conventional
            overbought/oversold bands - a level, not a recommendation.
          </p>
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">MACD (12, 26, 9)</span>
            <span className="font-mono text-[11px] tabular-nums text-primary">
              {latest?.macd === null || latest?.macd === undefined ? "-" : latest.macd.toFixed(2)}
            </span>
          </div>
          <div className="px-2 pt-3 pb-2">
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1C1C1C" vertical={false} />
                <XAxis dataKey="ts" tickFormatter={tickFormat} minTickGap={48} tick={{ fill: "#5A5A5A", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis width={44} tick={{ fill: "#5A5A5A", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => Number(v).toFixed(1)} />
                <Tooltip {...tooltip} formatter={(v, n) => [Number(v).toFixed(2), String(n)] as [string, string]} labelFormatter={(l) => new Date(String(l)).toLocaleDateString()} />
                <ReferenceLine y={0} stroke="#3A3A3A" />
                <Bar dataKey="histogram" name="Histogram" fill="#2A2A2A" isAnimationActive={false} />
                <Line type="monotone" dataKey="macd" name="MACD" stroke={INDICATOR_COLOURS.macd} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="signal" name="Signal" stroke={INDICATOR_COLOURS.signal} strokeWidth={1.25} dot={false} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="px-4 pb-3.5 text-[11.5px] text-dim">
            12/26 EMA difference with a 9-period signal line; the bars are the gap between them. Both EMAs are
            SMA-seeded, so the first value appears on the 26th bar rather than the first.
          </p>
        </div>
      </div>
    </div>
  );
}
