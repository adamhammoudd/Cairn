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
