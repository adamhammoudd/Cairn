interface SparklineProps {
  values: number[];
  positive: boolean;
  /** Tailwind width class; rows use the default, wider contexts can override. */
  className?: string;
  /** Stagger the draw-in when many render down a table. */
  delayMs?: number;
}

// Inline SVG rather than Recharts: these render once per row and Recharts'
// ResponsiveContainer is heavy at that multiplicity.
export function Sparkline({ values, positive, className = "h-7 w-[90px]", delayMs = 0 }: SparklineProps) {
  if (values.length < 2) {
    return <div className={`${className} text-[11px] text-dim`}>-</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = 100 / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${(24 - ((v - min) / range) * 22).toFixed(2)}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 28" className={`block ${className}`} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "var(--color-accent)" : "var(--color-negative)"}
        strokeWidth={1.8}
        strokeLinejoin="round"
        pathLength="1"
        strokeDasharray="1"
        className="animate-draw"
        style={{ animationDelay: `${delayMs}ms` }}
      />
    </svg>
  );
}
