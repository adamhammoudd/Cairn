// One sparkline, used by every surface that draws one.
//
// There were three: this component, `trendPoints()` in the markets ticker list
// and `sparklinePoints()` in the dashboard - the latter two byte-identical to
// each other and subtly different from this one, so the same series drew with
// different insets depending on which screen you were looking at. A sparkline
// is a chart; three implementations of it is three places for a chart bug to
// live independently, which is exactly what the chart-accuracy pass found
// elsewhere in this codebase.

interface SparklineProps {
  values: number[];
  positive: boolean;
  /** Tailwind size class; rows use the default, wider contexts override it. */
  className?: string;
  /** Stagger the draw-in when many render down a table. */
  delayMs?: number;
  /**
   * Explicit stroke, for contexts where colour encodes series identity rather
   * than direction (the Compare page, where the chart below colours the same
   * series by position). Omit it and the sparkline colours by gain/loss, which
   * is what a watchlist or markets row wants.
   */
  color?: string;
  /** Fixed pixel size instead of a CSS-sized, aspect-stretched box. */
  width?: number;
  height?: number;
  /** Let the box stretch to its container rather than preserving aspect. */
  stretch?: boolean;
}

const VIEW_W = 100;
const VIEW_H = 28;
// Half the stroke width, so the extreme points are drawn inside the box
// instead of being clipped along the top and bottom edges.
const PAD = 1;

/**
 * Map a series onto an SVG polyline within `width` x `height`, insetting by
 * `pad` so the stroke is not clipped at the extremes. Exported because a few
 * callers draw into a fixed-size box of their own.
 */
export function sparklinePoints(values: number[], width: number, height: number, pad = PAD): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const usable = height - pad * 2;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + (1 - (v - min) / span) * usable;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

// Inline SVG rather than Recharts: these render once per row and Recharts'
// ResponsiveContainer is heavy at that multiplicity.
export function Sparkline({
  values,
  positive,
  className = "h-7 w-[90px]",
  delayMs = 0,
  color,
  width,
  height,
  stretch = false,
}: SparklineProps) {
  const w = width ?? VIEW_W;
  const h = height ?? VIEW_H;

  // Fewer than two points is not an error - a holding added today, a crypto
  // whose history hasn't backfilled, an illiquid name with one stored bar.
  // A bare "-" in a chart column reads as a render bug; a flat dashed baseline
  // reads as "no movement to plot yet", which is the honest state.
  if (values.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        {...(width && height ? { width, height } : {})}
        className={`block ${className}`}
        preserveAspectRatio={stretch || !width ? "none" : "xMidYMid meet"}
        role="img"
        aria-label="No price history yet"
      >
        <title>No price history yet</title>
        <line
          x1={PAD}
          y1={h / 2}
          x2={w - PAD}
          y2={h / 2}
          stroke="var(--color-dim, #7b7b7b)"
          strokeWidth={1}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      {...(width && height ? { width, height } : {})}
      className={`block ${className}`}
      preserveAspectRatio={stretch || !width ? "none" : "xMidYMid meet"}
    >
      <polyline
        points={sparklinePoints(values, w, h)}
        fill="none"
        stroke={color ?? (positive ? "var(--color-accent)" : "var(--color-negative)")}
        strokeWidth={1.8}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength="1"
        strokeDasharray="1"
        className="animate-draw"
        style={{ animationDelay: `${delayMs}ms` }}
      />
    </svg>
  );
}
