export interface SectorMapNode {
  name: string;
  children: {
    name: string;
    size: number;
    changePct: number | null;
    /** Company/coin display name, for the hover tooltip - null when none is on file. */
    displayName: string | null;
  }[];
}

function opacityForChange(pct: number): number {
  return 0.15 + Math.min(Math.abs(pct) / 5, 1) * 0.85;
}

// Reuses the app's existing green/red hex convention (see ticker-chart.tsx)
// rather than introducing a new palette - opacity scales with move size so
// bigger daily moves read as more saturated boxes.
export function colorForChange(pct: number | null): string {
  if (pct === null) return "rgba(138, 138, 138, 0.25)"; // neutral border-line gray
  const opacity = opacityForChange(pct);
  return pct >= 0 ? `rgba(47, 198, 133, ${opacity})` : `rgba(217, 108, 108, ${opacity})`;
}

// A saturated tile needs near-black text; a faint one is mostly canvas showing
// through and needs light text. Without this split, small-move tiles render
// black-on-black.
export function labelToneForChange(pct: number | null): "dark" | "light" {
  if (pct === null) return "light";
  return opacityForChange(pct) > 0.55 ? "dark" : "light";
}

// Weighted by tile area so a sector's headline number reflects its big names,
// matching how the tiles are sized.
export function weightedAvgChange(children: SectorMapNode["children"]): number | null {
  const scored = children.filter((c) => c.changePct !== null && c.size > 0);
  if (scored.length === 0) return null;
  const totalSize = scored.reduce((sum, c) => sum + c.size, 0);
  if (totalSize === 0) return null;
  return scored.reduce((sum, c) => sum + (c.changePct as number) * c.size, 0) / totalSize;
}
