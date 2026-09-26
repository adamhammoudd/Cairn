// "What this means for you": factual arithmetic about the reader's own
// exposure to one holding. Computed in code only, never by the model, and
// never an evaluation or a suggestion - no "too much", no "you should".
//
// [DECISION: Adam] CLAUDE.md says the engine "NEVER analyzes ... a specific
// user's personal position". These lines are arithmetic on the reader's own
// figures, not analysis or advice, but they touch that rule, so the box is off
// unless ENABLE_EXPOSURE_FIGURES=true. Proposed CLAUDE.md wording is in the PR.

export function isExposureEnabled(flag: string | undefined = process.env.ENABLE_EXPOSURE_FIGURES): boolean {
  return flag === "true";
}

export interface ExposureInput {
  symbol: string;
  /** Every holding's current value in USD; null when unpriced. */
  holdings: { symbol: string; value: number | null }[];
  /** Median absolute results-day move (fraction), or null with no history. */
  medianEarningsMove: number | null;
  /**
   * Scorecard dimensions whose level dropped since the card a week ago; null
   * when there is no week-old card to compare with (the line is left out).
   */
  weakenedThisWeek: string[] | null;
}

export interface ExposureFacts {
  positionValue: number;
  portfolioValue: number;
  share: number;
  isLargest: boolean;
  medianEarningsMove: number | null;
  earningsSwing: number | null;
  weakenedThisWeek: string[] | null;
}

export function exposureFacts(i: ExposureInput): ExposureFacts | null {
  const priced = i.holdings.filter((h): h is { symbol: string; value: number } => h.value !== null && h.value > 0);
  // One symbol may be held in several lots.
  const bySymbol = new Map<string, number>();
  for (const h of priced) bySymbol.set(h.symbol, (bySymbol.get(h.symbol) ?? 0) + h.value);
  const position = bySymbol.get(i.symbol);
  if (!position) return null;
  const total = [...bySymbol.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const largest = Math.max(...bySymbol.values());
  return {
    positionValue: position,
    portfolioValue: total,
    share: position / total,
    isLargest: position === largest && bySymbol.size > 1,
    medianEarningsMove: i.medianEarningsMove,
    earningsSwing: i.medianEarningsMove === null ? null : Math.abs(i.medianEarningsMove) * position,
    weakenedThisWeek: i.weakenedThisWeek,
  };
}

/** Two significant figures, for a figure introduced with "roughly". */
export function roughMoney(v: number): number {
  if (v === 0 || !Number.isFinite(v)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
  return Math.round(v / mag) * mag;
}

/**
 * The box's lines. `formatRough` turns a USD amount into the reader's
 * currency, rounded to two significant figures IN that currency.
 */
export function exposureLines(name: string, f: ExposureFacts, formatRough: (usd: number) => string): string[] {
  const lines: string[] = [];
  const pct = Math.round(f.share * 100);
  const share = pct < 1 ? "less than 1%" : pct === 1 ? "about 1%" : `${pct}%`;
  // Not "your largest holding": the scope guard reads "holding" as the verb
  // "hold", and a line about the reader's portfolio must pass it like any other.
  lines.push(`${name} is ${share} of your portfolio${f.isLargest ? ", the biggest part of it" : ""}.`);
  if (f.medianEarningsMove !== null && f.earningsSwing !== null) {
    lines.push(
      `On a typical results day it has moved ${(Math.round(f.medianEarningsMove * 1000) / 10).toFixed(1)}%, roughly ${formatRough(f.earningsSwing)} either way on this holding.`,
    );
  }
  if (f.weakenedThisWeek !== null && f.weakenedThisWeek.length === 0) {
    lines.push("Nothing on its scorecard weakened this week.");
  }
  return lines;
}
