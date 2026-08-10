export interface SectorMapNode {
  name: string;
  children: { name: string; size: number; changePct: number | null }[];
}

// Reuses the app's existing green/red hex convention (see ticker-chart.tsx)
// rather than introducing a new palette — opacity scales with move size so
// bigger daily moves read as more saturated boxes.
export function colorForChange(pct: number | null): string {
  if (pct === null) return "rgba(138, 138, 138, 0.25)"; // neutral border-line gray
  const opacity = 0.15 + Math.min(Math.abs(pct) / 5, 1) * 0.85;
  return pct >= 0 ? `rgba(47, 198, 133, ${opacity})` : `rgba(217, 108, 108, ${opacity})`;
}
