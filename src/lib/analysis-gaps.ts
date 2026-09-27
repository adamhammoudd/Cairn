// Why an analysis could not be produced, in words that name the real reason.
//
// lib/ai/generate.ts used to throw three differently-worded Errors that
// lib/actions/analysis.ts matched by substring and mapped, all three, to one
// message about "historical data". A stock with five years of prices and no
// tagged news read as a history problem, and nothing was logged, so a report
// could not be diagnosed. Now generate.ts throws an AnalysisDataGap carrying
// each reason, and this module is the one place a reason becomes words.
//
// Pure: no database, no framework. Importable by the server action, the chat
// route and the tests alike.

export type DataGapReason =
  /** No news item is tagged with the ticker, so there is nothing to cite. */
  | "no_news"
  /** Today's factor state matched fewer past moments than the scan needs. */
  | "unusual_setup"
  /** Nothing is unusual today and no labelled past cases are on file. */
  | "ordinary_no_record"
  /** Fewer stored bars than the factor scan needs. */
  | "short_history"
  /** No stored bars at all. */
  | "no_price_history"
  /** A sector or market scope with no news and no past events. */
  | "no_record"
  /** A sector or market scope with news but no past events to measure. */
  | "no_past_events";

export interface DataGap {
  reason: DataGapReason;
  /** Stored bars, for short_history. */
  bars?: number;
  /** Past moments today's state matched, for unusual_setup. */
  matches?: number;
  /** The fewest the scan accepts, for unusual_setup. */
  needed?: number;
}

export class AnalysisDataGap extends Error {
  readonly gaps: DataGap[];
  readonly scope: string;
  /** The directory name ("Micron Technology, Inc."), when one is on file. */
  readonly displayName: string | null;
  readonly assetType: string | null;
  constructor(scope: string, gaps: DataGap[], about: { name?: string | null; assetType?: string | null } = {}) {
    super(`Analysis data gap for "${scope}": ${gaps.map(describeGap).join("; ")}`);
    this.name = "AnalysisDataGap";
    this.scope = scope;
    this.gaps = gaps;
    this.displayName = about.name ?? null;
    this.assetType = about.assetType ?? null;
  }
}

/** One line per gap for the server log: the reason code plus its figures. */
export function describeGap(g: DataGap): string {
  const figures = [g.bars !== undefined ? `bars=${g.bars}` : null, g.matches !== undefined ? `matches=${g.matches}` : null, g.needed !== undefined ? `needed=${g.needed}` : null].filter(Boolean);
  return figures.length > 0 ? `${g.reason} (${figures.join(", ")})` : g.reason;
}

/** Shares trade on weekdays; coins every day. Count in the unit a reader would. */
function daysWords(bars: number, assetType: string | null): string {
  const unit = assetType === "crypto" ? "day" : "trading day";
  return `${bars} ${unit}${bars === 1 ? "" : "s"}`;
}

/** The reader-facing sentence for one gap. `name` is the plain name ("Micron"), never a bare ticker when one is known. */
export function gapSentence(g: DataGap, name: string, assetType: string | null): string {
  switch (g.reason) {
    case "no_news":
      return `No recent news mentions ${name}, so there's nothing to cite yet.`;
    case "unusual_setup": {
      const n = g.matches ?? 0;
      return `Today's setup for ${name} is unusual: it matched ${n === 0 ? "no" : `only ${n}`} past moment${n === 1 ? "" : "s"}, too few to measure.`;
    }
    case "ordinary_no_record":
      return `Nothing about ${name}'s price is unusual today, and there are no past cases on file to compare it with yet.`;
    case "short_history":
      return `${name} has only ${daysWords(g.bars ?? 0, assetType)} of price history, too new to compare with its own past.`;
    case "no_price_history":
      return `${name} has no stored price history yet, so there is nothing to compare with its own past.`;
    case "no_record":
      return `There's no news or past-event record for ${name} yet.`;
    case "no_past_events":
      return `There are no past events on record for ${name} to measure against yet.`;
  }
}

const TITLES: Record<DataGapReason, string> = {
  no_news: "No recent news to cite",
  unusual_setup: "Today's setup is unusual",
  ordinary_no_record: "No past cases on file yet",
  short_history: "Too new to compare with its own past",
  no_price_history: "No price history yet",
  no_record: "Nothing on record yet",
  no_past_events: "No past events on record yet",
};

export interface GapExplanation {
  /** Every reason, in the order generate.ts found them. The first one titles the panel. */
  reasons: DataGapReason[];
  title: string;
  message: string;
}

/** The panel's title and message for a set of gaps: every reason, one sentence each. */
export function explainGaps(gaps: DataGap[], name: string, assetType: string | null): GapExplanation {
  if (gaps.length === 0) throw new Error("explainGaps needs at least one gap");
  return {
    reasons: gaps.map((g) => g.reason),
    title: TITLES[gaps[0].reason],
    message: gaps.map((g) => gapSentence(g, name, assetType)).join(" "),
  };
}

/** What generate.ts knows at the point it decides whether it can go on. */
export interface GapInputs {
  scopeType: "ticker" | "sector" | "market";
  /** Analogs with a usable before/after price, of any source. */
  analogCount: number;
  /** Sources the analysis can cite. */
  sourceCount: number;
  /** The factor scan, for a ticker: null when it could not run (too few bars). */
  factor: { ok: true } | { ok: false; reason: "no_active_conditions" | "insufficient_instances"; bestSampleSize: number } | null;
  /** Stored bars; read only when the factor scan could not run. */
  bars?: number;
  /** The scan's minimum sample, for the unusual-setup sentence. */
  minSample: number;
}

/** Every reason generation cannot go on, in reading order: the history first, then sources. Empty when it can. */
export function findDataGaps(i: GapInputs): DataGap[] {
  const gaps: DataGap[] = [];
  if (i.analogCount === 0) {
    if (i.scopeType !== "ticker") gaps.push({ reason: i.sourceCount === 0 ? "no_record" : "no_past_events" });
    else if (!i.factor) gaps.push(i.bars ? { reason: "short_history", bars: i.bars } : { reason: "no_price_history", bars: 0 });
    else if (!i.factor.ok && i.factor.reason === "insufficient_instances") gaps.push({ reason: "unusual_setup", matches: i.factor.bestSampleSize, needed: i.minSample });
    else gaps.push({ reason: "ordinary_no_record" });
  }
  // "no_record" already says there is no news.
  if (i.sourceCount === 0 && gaps[0]?.reason !== "no_record") gaps.push({ reason: "no_news" });
  return gaps;
}
