/**
 * Shared Recharts theming.
 *
 * Five chart components each declared their own tooltip surface, axis tick and
 * grid stroke inline. They had already drifted - the same "1px solid #2A2A2A"
 * border was typed out five times while the axis fill sat at #5A5A5A, which
 * measures 2.4:1 against the canvas and fails the 4.5:1 floor that applies to
 * axis labels as text.
 *
 * Recharts takes plain style objects rather than class names, so the design
 * tokens are referenced here as CSS custom properties: one definition per role,
 * resolved by the browser against globals.css like every other surface.
 */

/** Tooltip surface. Sits above a panel, so it takes the raised step. */
export const CHART_TOOLTIP = {
  contentStyle: {
    background: "var(--color-raised)",
    border: "1px solid var(--color-line)",
    borderRadius: "var(--radius-control)",
    fontSize: "var(--text-caption)",
    color: "var(--color-primary)",
    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.55)",
  },
  labelStyle: { color: "var(--color-muted)" },
  itemStyle: { color: "var(--color-primary)" },
  /** Recharts' default cursor is a heavy opaque band; keep it a hairline. */
  cursor: { stroke: "var(--color-line-strong)", strokeWidth: 1 },
} as const;

/** Axis labels are text: --color-axis resolves to --color-muted (4.6:1). */
export const CHART_AXIS_TICK = { fill: "var(--color-axis)", fontSize: 10 } as const;

/**
 * A price axis domain with headroom.
 *
 * Recharts' `["dataMin", "dataMax"]` pins the series to the exact top and
 * bottom of the plot area. Every chart then fills its whole height no matter
 * what the underlying move was: a 1.5% monthly drift and a 60% run draw the
 * identical mountain, with the extremes clipped flat against the frame. Read
 * without an axis - which is how these shipped - the shape carries no
 * information about price at all.
 *
 * Padding by a share of the actual range keeps the *shape* truthful while
 * giving the line somewhere to sit, so a flat month reads as a flat month.
 * A zero-range series (one bar, or a genuinely unchanged price) gets a small
 * absolute window instead of collapsing to a single line.
 */
/**
 * A "nice" tick step for a range - 1, 2, 5 or 10 times a power of ten.
 *
 * Bounds derived straight from the data give ticks like "€183.32", which no
 * one reads a price against. Snapping the bounds to a round step makes the
 * axis land on €180 / €185 / €190 instead. Scale-free, so it works on a
 * €4.56T market cap and a €0.0004 coin alike.
 */
function niceStep(range: number, targetTicks = 4): number {
  const raw = range / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

export function paddedDomain(values: number[], pad = 0.12): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) {
    const nudge = Math.abs(max) * 0.01 || 1;
    return [min - nudge, max + nudge];
  }
  const margin = (max - min) * pad;
  const step = niceStep(max - min + margin * 2);
  // Round outward, so the padding only ever grows and the series always fits.
  return [Math.floor((min - margin) / step) * step, Math.ceil((max + margin) / step) * step];
}

/** Grid lines are non-text furniture and must never compete with the series. */
export const CHART_GRID = { stroke: "var(--color-grid)", vertical: false } as const;

/**
 * Categorical series colours, for charts plotting more than one line.
 *
 * Deliberately excludes the accent green and the negative red: those two carry
 * the gain/loss semantic everywhere else in the product, and reusing them for
 * "series 3" is exactly how that meaning erodes. Ordered for distinguishability
 * against the dark canvas, and paired with distinct dash patterns by consumers
 * so the series remain separable without colour.
 */
export const CHART_SERIES = [
  "var(--color-info)",
  "var(--color-violet)",
  "var(--color-warning)",
  "var(--color-muted)",
] as const;
