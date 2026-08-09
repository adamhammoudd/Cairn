interface SparklineProps {
  values: number[];
  positive: boolean;
}

// Inline SVG rather than Recharts: these render once per row and Recharts'
// ResponsiveContainer is heavy at that multiplicity.
export function Sparkline({ values, positive }: SparklineProps) {
  if (values.length < 2) {
    return <div className="h-7 w-[90px] text-[11px] text-dim">—</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = 100 / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${(24 - ((v - min) / range) * 22).toFixed(2)}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 28" className="h-7 w-[90px]" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#2FC685" : "#D96C6C"}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
