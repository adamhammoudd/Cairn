"use client";

import { useState } from "react";

export type ValueTimeframe = "1W" | "1M" | "3M" | "1Y";

export const VALUE_TIMEFRAMES: ValueTimeframe[] = ["1W", "1M", "3M", "1Y"];

export interface ValueSeries {
  values: number[];
  /** ISO dates, index-aligned with `values`, for the axis labels. */
  dates: string[];
}

interface PortfolioValueChartProps {
  series: Partial<Record<ValueTimeframe, ValueSeries>>;
  initialTimeframe: ValueTimeframe;
}

// The chart draws into a fixed viewBox and is stretched to its container by
// preserveAspectRatio="none". Every stroke therefore carries
// vectorEffect="non-scaling-stroke", or the horizontal stretch would thin the
// line and fatten nothing else.
const VIEW_W = 600;
const VIEW_H = 190;
const PAD_Y = 10;

/**
 * Turn a series into a smoothed path through every point.
 *
 * A polyline through daily closes reads as a jagged sawtooth at this size; the
 * design draws a curve. This is a monotone cubic Hermite spline
 * (Fritsch-Carlson), not the more obvious Catmull-Rom, for one reason: a
 * Catmull-Rom curve overshoots around a sharp move, so a portfolio that fell
 * to a low and bounced gets drawn dipping *below* the low it actually hit.
 * Inventing a trough on a chart of someone's money is not a rounding error.
 *
 * Monotone interpolation is bounded by the data: between two points the curve
 * never leaves the interval they span, and it passes exactly through each one.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0].x},${points[0].y}`;
  if (n === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }

  // Secant slopes between consecutive points.
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    delta.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }

  // Initial tangents: one-sided at the ends, averaged in the middle.
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  }

  // Fritsch-Carlson limiter: clamp tangents into the circle of radius 3 so no
  // segment can overshoot the interval its endpoints define.
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / delta[i];
    const beta = m[i + 1] / delta[i];
    const sq = alpha * alpha + beta * beta;
    if (sq > 9) {
      const tau = 3 / Math.sqrt(sq);
      m[i] = tau * alpha * delta[i];
      m[i + 1] = tau * beta * delta[i];
    }
  }

  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const c1x = points[i].x + dx / 3;
    const c1y = points[i].y + (m[i] * dx) / 3;
    const c2x = points[i + 1].x - dx / 3;
    const c2y = points[i + 1].y - (m[i + 1] * dx) / 3;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${points[i + 1].x.toFixed(2)},${points[i + 1].y.toFixed(2)}`;
  }
  return d;
}

function formatAxisDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function PortfolioValueChart({ series, initialTimeframe }: PortfolioValueChartProps) {
  // Only offer a range that actually has a drawable series behind it. A 1W
  // button that renders an empty box is worse than no 1W button: the reader
  // cannot tell "no history" from "broken".
  const available = VALUE_TIMEFRAMES.filter((tf) => (series[tf]?.values.length ?? 0) > 1);
  const [timeframe, setTimeframe] = useState<ValueTimeframe>(
    available.includes(initialTimeframe) ? initialTimeframe : (available[0] ?? initialTimeframe),
  );

  const active = series[timeframe];
  const values = active?.values ?? [];
  const dates = active?.dates ?? [];

  if (values.length < 2) {
    return (
      <div className="flex h-full min-h-[190px] items-center justify-center">
        <span className="font-mono text-caption text-dim">Not enough history to chart</span>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const usable = VIEW_H - PAD_Y * 2;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * VIEW_W,
    y: PAD_Y + (1 - (v - min) / span) * usable,
  }));

  // Coloured by the window it draws, not by all-time gain - the same rule the
  // Portfolio chart, the sparklines and the table rows follow.
  const positive = values[values.length - 1] >= values[0];
  const stroke = positive ? "var(--color-accent)" : "var(--color-negative)";
  const gradientId = `value-chart-fill-${positive ? "gain" : "loss"}`;

  const line = smoothPath(points);
  const last = points[points.length - 1];
  const area = `${line} L ${VIEW_W},${VIEW_H} L 0,${VIEW_H} Z`;

  // First, middle and last, which is what the design labels. More than three
  // crowds at the widths this panel actually gets.
  const axisIndices = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-eyebrow text-muted uppercase">Value · {timeframe}</span>
        {available.length > 1 && (
          <div className="flex items-center rounded-control border border-line p-0.5" role="group" aria-label="Chart range">
            {available.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                aria-pressed={tf === timeframe}
                className={`rounded-xs px-2.5 py-1 font-mono text-micro tabular-nums transition-colors duration-fast ease-standard ${
                  tf === timeframe ? "bg-active text-primary" : "text-dim hover:text-primary"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* `relative`, because the end-of-series marker is positioned against
          this box rather than drawn in the SVG: the viewBox is stretched
          horizontally, so an SVG circle would render as an ellipse. The last
          point is always at the right edge, and the stretch is linear, so its
          height fraction maps exactly onto the container's. */}
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="block h-full max-h-full w-full max-w-full"
          role="img"
          aria-label={`Portfolio value over ${timeframe}, ${positive ? "up" : "down"} over the window`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Two faint rules, at a third and two thirds. They give the curve
              something to sit against without implying gridded values - the
              axis is deliberately unlabelled, because the figure that matters
              is set at display size beside the chart. */}
          {[1 / 3, 2 / 3].map((f) => (
            <line
              key={f}
              x1="0"
              y1={VIEW_H * f}
              x2={VIEW_W}
              y2={VIEW_H * f}
              stroke="var(--color-line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            strokeDasharray="1"
            className="animate-draw"
          />
        </svg>

        <span
          aria-hidden
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: "100%",
            top: `${((last.y / VIEW_H) * 100).toFixed(2)}%`,
            background: stroke,
          }}
        />
      </div>

      {dates.length > 1 && (
        <div className="mt-2 flex justify-between font-mono text-eyebrow text-dim uppercase">
          {axisIndices.map((i, n) => (
            <span key={n}>{formatAxisDate(dates[i])}</span>
          ))}
        </div>
      )}

    </div>
  );
}
