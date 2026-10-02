// One view of an analysis for every surface that shows one: ticker page,
// Research, Assistant, briefing card, Base Camp (feat/analysis-display-v2,
// docs/decisions/2026-09-27-analysis-rebuild.md).
//
// Pure: built on the server from rows already read, then handed to the one
// component that draws it (components/analysis/analysis-view.tsx). The plan
// decision is made HERE, before serialisation: a Free payload never contains
// the per-case dates and moves, the trader figures (the >=5% band, RSI,
// volatility, drawdown) or the quarterly company table. Hiding them in the UI
// would not be gating - a server action's return value is readable.
//
// Works for analyses stored before migration 0052 too: their headline comes
// from the plain summary (or the first sentence of the old prose), and their
// history from the plain summary's history.

import { historyWords, horizonPhrase, type HistoryBasis, type HistoryContext } from "@/lib/ai/analysis-text";
import type { DirectionalHistory } from "@/lib/ai/direction";
import { plainConditions } from "@/lib/ai/history-plain";
import type { Scorecard } from "@/lib/scorecard";
import { noNewsLine } from "@/lib/ai/data-sources";

export type Plan = "free" | "premium";

export interface DisplayHistory {
  /**
   * "baseline": the base rate over every stretch - never "similar moments".
   * "earnings": results were due, so past results releases from the same point before.
   */
  kind: "direction" | "baseline" | "earnings" | "legacy" | "none";
  /** Which analog source this is, in words, when it is not similar moments: "Base rate" / "Around past results". */
  basisLabel: string | null;
  line: string;
  range: string | null;
  extremes: string | null;
  confidence: "low" | "medium" | "high";
  /** "Confidence: medium, from only 14 cases." */
  confidenceText: string;
  caveat: string;
  n: number;
  higher: number;
  lower: number;
  horizon: string;
  /** One per case, oldest first, no dates: free on every plan (aggregate only). */
  dots: ("higher" | "lower")[];
  /** What the similar moments were matched on, in plain words. */
  matchedOn: string[];
}

export interface DisplayDataSource {
  kind: string;
  label: string;
  reference: string;
  url: string | null;
}

export interface DisplayCase {
  date: string;
  dateAfter: string | null;
  movePct: number;
  note: string | null;
}

export interface DisplayTrader {
  thresholdPct: number;
  bandLow: number;
  bandHigh: number;
  sampleSize: number;
  confidence: string;
  readings: { label: string; value: number | null; percentile: number | null; stateLabel: string | null }[];
}

export interface DisplayWatch {
  text: string;
  kind: "event" | "source" | "none";
  url: string | null;
}

export interface AnalysisDisplay {
  id: string;
  scopeType: string;
  scopeValue: string;
  name: string;
  createdAt: string;
  textSource: "model" | "template" | "legacy";
  headline: string;
  bullets: string[];
  history: DisplayHistory;
  scorecard: Scorecard | null;
  watch: DisplayWatch[];
  /** news_items ids the summary relied on (a subset of the analysis sources). */
  sourcesUsed: string[];
  /** The data the figures were computed from (migration 0057): filings, prices, calendar. Every plan. */
  dataSources: DisplayDataSource[];
  /** Set when the analysis cites no news: the plain line saying so, computed in code. */
  noNews: string | null;
  /** Premium: every case the direction was counted from. Null on Free. */
  cases: DisplayCase[] | null;
  /** How many cases exist, on every plan (so Free can say "Premium shows all 14"). */
  caseCount: number;
  /** Premium only. */
  trader: DisplayTrader | null;
  plan: Plan;
}

/** The subset of an ai_analyses row this module reads (old and new rows). */
export interface AnalysisRowLike {
  id: string;
  scope_type: string;
  scope_value: string;
  analysis_type: string;
  created_at: string;
  confidence_level: string;
  sample_size: number;
  probability_low?: number | null;
  probability_high?: number | null;
  reasoning_text: string;
  plain_summary?: unknown;
  headline?: string | null;
  bullets?: unknown;
  watch?: unknown;
  sources_used?: string[] | null;
  text_source?: string | null;
  direction_horizon_sessions?: number | null;
  direction_n?: number | null;
  direction_higher?: number | null;
  direction_up_low?: number | null;
  direction_up_high?: number | null;
  direction_confidence?: string | null;
  direction_p25?: number | string | null;
  direction_median?: number | string | null;
  direction_p75?: number | string | null;
  direction_worst?: number | string | null;
  direction_best?: number | string | null;
  direction_conditions?: unknown;
}

/** A case row as read from the analog links (service role). */
export interface CaseRow {
  event_date: string;
  price_before: number | null;
  price_after: number | null;
  note: string | null;
  date_after: string | null;
  in_direction_set: boolean;
}

interface LegacySummary {
  headline?: string;
  bullets?: string[];
  scorecard?: Scorecard;
  history?: { status?: string; headline?: string; rangeSentence?: string; n?: number; higher?: number; notHigher?: number; horizon?: string; confidence?: string; dots?: ("higher" | "not_higher")[] } | null;
}

const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

function legacySummary(row: AnalysisRowLike): LegacySummary | null {
  const s = row.plain_summary;
  return s && typeof s === "object" ? (s as LegacySummary) : null;
}

/** First sentence of the old prose, for rows with neither a headline nor a plain summary. */
function firstSentence(text: string): string {
  const m = text.match(/^([\s\S]*?[.!?])(\s|$)/);
  return (m ? m[1] : text).trim();
}

export function displayText(row: AnalysisRowLike): { headline: string; bullets: string[]; textSource: AnalysisDisplay["textSource"] } {
  if (row.headline) {
    const bullets = Array.isArray(row.bullets) ? (row.bullets as unknown[]).filter((b): b is string => typeof b === "string") : [];
    return { headline: row.headline, bullets, textSource: row.text_source === "model" ? "model" : "template" };
  }
  const ps = legacySummary(row);
  if (ps?.headline) return { headline: ps.headline, bullets: ps.bullets ?? [], textSource: "legacy" };
  return { headline: firstSentence(row.reasoning_text), bullets: [], textSource: "legacy" };
}

function matchedOnFrom(conditions: unknown): string[] {
  const c = conditions as { factor?: { key: string; state: string }[]; extra?: { key: string; kept: boolean; today: string | null }[] } | null;
  if (!c) return [];
  const words: string[] = [];
  for (const f of c.factor ?? []) {
    const w = plainConditions([{ key: f.key, state: f.state }]);
    if (w) words.push(w);
  }
  for (const e of c.extra ?? []) {
    if (!e.kept || !e.today) continue;
    if (e.key === "earnings_window") words.push(e.today === "within" ? "results due within 7 trading days" : "no results due within 7 trading days");
    if (e.key === "trend_level") words.push(`a ${e.today.toLowerCase()} price trend`);
  }
  return [...new Set(words)];
}

/** The direction as the engine stored it, rebuilt enough for historyWords. */
function storedDirection(row: AnalysisRowLike): DirectionalHistory | null {
  if (row.direction_n === null || row.direction_n === undefined) return null;
  const n = row.direction_n;
  const higher = row.direction_higher ?? 0;
  const p25 = num(row.direction_p25);
  const median = num(row.direction_median);
  const p75 = num(row.direction_p75);
  return {
    status: n >= 5 && p25 !== null ? "ok" : "too_few",
    horizonSessions: row.direction_horizon_sessions ?? 10,
    n,
    higher,
    lower: n - higher,
    upRate: { point: n > 0 ? Math.round((higher / n) * 100) : null, low: row.direction_up_low ?? null, high: row.direction_up_high ?? null },
    confidence: (row.direction_confidence as DirectionalHistory["confidence"]) ?? "low",
    typical: p25 !== null && median !== null && p75 !== null ? { p25, median, p75 } : null,
    worst: num(row.direction_worst),
    best: num(row.direction_best),
    cases: [],
    trader: { thresholdPct: 5, moveBand: { pointEstimate: 0, low: 0, high: 0, confidence: "low", sampleCount: 0, hitCount: 0 } },
  };
}

export function displayHistory(row: AnalysisRowLike, name: string, assetType: string | null, cases: CaseRow[]): DisplayHistory {
  const dotsFrom = (rows: CaseRow[]) =>
    rows
      .filter((c) => c.price_before !== null && c.price_after !== null && c.price_before > 0)
      .sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
      .map((c) => ((c.price_after as number) > (c.price_before as number) ? "higher" : "lower") as "higher" | "lower");

  const d = storedDirection(row);
  if (d || row.headline) {
    const cond = (row.direction_conditions ?? null) as { basis?: string; fallback?: { matches?: number }; earnings?: { sessions_to_release?: number } } | null;
    const basis: HistoryBasis = cond?.basis === "baseline" ? "baseline" : cond?.basis === "earnings" ? "earnings" : "similar";
    const ctx: HistoryContext = {
      ...(typeof cond?.fallback?.matches === "number" ? { fallback: { matches: cond.fallback.matches } } : {}),
      ...(typeof cond?.earnings?.sessions_to_release === "number" ? { sessionsToRelease: cond.earnings.sessions_to_release } : {}),
    };
    const w = historyWords(d, name, assetType, d ? null : "no_active_conditions", basis, ctx)!;
    return {
      kind: d ? (basis === "baseline" ? "baseline" : basis === "earnings" ? "earnings" : "direction") : "none",
      basisLabel: !d
        ? null
        : basis === "earnings"
          ? "Around past results: today's setup matched too few past moments"
          : basis === "baseline"
            ? ctx.fallback
              ? "Base rate: today's setup matched too few past moments"
              : "Base rate: nothing unusual today"
            : null,
      line: w.line,
      range: w.range,
      extremes: w.extremes,
      confidence: d?.confidence ?? "low",
      confidenceText: w.confidence,
      caveat: w.caveat,
      n: d?.n ?? 0,
      higher: d?.higher ?? 0,
      lower: d ? d.n - d.higher : 0,
      horizon: horizonPhrase(d?.horizonSessions ?? 10, assetType),
      dots: dotsFrom(cases.filter((c) => c.in_direction_set)),
      matchedOn: matchedOnFrom(row.direction_conditions),
    };
  }

  // Before 0052: the plain summary's history, if the row has one.
  const h = legacySummary(row)?.history;
  if (h && h.headline) {
    return {
      kind: "legacy",
      basisLabel: null,
      line: h.headline,
      range: h.rangeSentence || null,
      extremes: null,
      confidence: (h.confidence as DisplayHistory["confidence"]) ?? "low",
      confidenceText: `Confidence: ${h.confidence ?? "low"}.`,
      caveat: "This is what happened before, not a forecast.",
      n: h.n ?? 0,
      higher: h.higher ?? 0,
      lower: h.notHigher ?? 0,
      horizon: h.horizon ?? horizonPhrase(10, assetType),
      dots: (h.dots ?? []).map((x) => (x === "higher" ? "higher" : "lower")),
      matchedOn: [],
    };
  }
  return {
    kind: "none",
    basisLabel: null,
    line: `This analysis of ${name} was made before Cairn counted similar moments.`,
    range: null,
    extremes: null,
    confidence: (row.confidence_level as DisplayHistory["confidence"]) ?? "low",
    confidenceText: `Confidence: ${row.confidence_level}.`,
    caveat: "This is what happened before, not a forecast.",
    n: 0,
    higher: 0,
    lower: 0,
    horizon: horizonPhrase(10, assetType),
    dots: [],
    matchedOn: [],
  };
}

/** The short form for lists (Research list, briefing card, Base Camp): headline and the history line. */
/**
 * The two lines on the Research card's "Similar moments" box, from ONE count.
 *
 * The header said "12 counted" while the body said "No close historical analog on
 * record" - two different sources (the case count the history was built from, and
 * whether a single closest analog row is attached) answering one question, and
 * contradicting each other (audit 2026-10-02, item 5.3). The body is now derived
 * from the same count: with cases it says how they were counted and where to see
 * them, and only with none does it say there is no analog.
 */
export function similarMomentsCard(input: {
  caseCount: number;
  kind: DisplayHistory["kind"];
  /** A closest analog row is attached and will be drawn. */
  hasAnalog: boolean;
}): { counted: string; empty: string | null } {
  const n = Math.max(0, Math.floor(input.caseCount));
  const counted = n > 0 ? `${n} counted` : "none counted";
  if (input.hasAnalog) return { counted, empty: null };
  if (n === 0) return { counted, empty: "No close historical analog on record." };
  const cases = `${n} past ${n === 1 ? "case was" : "cases were"} counted`;
  if (input.kind === "baseline") return { counted, empty: `${cases} from every stretch of past history, not only moments like today. Open the full analysis for the figures.` };
  return { counted, empty: `${cases}. Open the full analysis to see how they were chosen.` };
}

export function summaryLine(row: AnalysisRowLike, name: string, assetType: string | null): { headline: string; historyLine: string } {
  const t = displayText(row);
  const h = displayHistory(row, name, assetType, []);
  return { headline: t.headline, historyLine: h.line };
}

function watchFrom(row: AnalysisRowLike, sources: { id: string; url: string | null }[]): DisplayWatch[] {
  if (!Array.isArray(row.watch)) return [];
  const urls = new Map(sources.map((s) => [s.id, s.url]));
  return (row.watch as { text?: unknown; ref?: unknown }[])
    .filter((w) => typeof w?.text === "string")
    .map((w) => {
      const ref = typeof w.ref === "string" ? w.ref : "";
      const [kind, id] = ref.split(":");
      if (kind === "source") return { text: w.text as string, kind: "source" as const, url: urls.get(id) ?? null };
      if (kind === "event") return { text: w.text as string, kind: "event" as const, url: null };
      return { text: w.text as string, kind: "none" as const, url: null };
    });
}

export function buildAnalysisDisplay(args: {
  row: AnalysisRowLike;
  name: string;
  assetType: string | null;
  plan: Plan;
  cases: CaseRow[];
  sources: { id: string; url: string | null }[];
  dataSources?: DisplayDataSource[];
  factors: { factor_key: string; value: number | null; percentile: number | null; detail: Record<string, unknown> }[];
}): AnalysisDisplay {
  const { row, plan } = args;
  const text = displayText(row);
  const history = displayHistory(row, args.name, args.assetType, args.cases);
  const directionRows = args.cases.filter((c) => c.in_direction_set && c.price_before && c.price_after !== null);
  const premium = plan === "premium";
  const cases: DisplayCase[] = directionRows
    .sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
    .map((c) => ({
      date: c.event_date,
      dateAfter: c.date_after,
      movePct: Math.round((((c.price_after as number) - (c.price_before as number)) / (c.price_before as number)) * 1000) / 10,
      note: c.note,
    }));
  const hasBand = typeof row.probability_low === "number" && typeof row.probability_high === "number";
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeValue: row.scope_value,
    name: args.name,
    createdAt: row.created_at,
    textSource: text.textSource,
    headline: text.headline,
    bullets: text.bullets,
    history,
    scorecard: legacySummary(row)?.scorecard ?? null,
    watch: watchFrom(row, args.sources),
    sourcesUsed: Array.isArray(row.sources_used) ? row.sources_used : [],
    dataSources: args.dataSources ?? [],
    // Only a ticker analysed from its data says this; old rows and sectors always had news.
    noNews: args.sources.length === 0 && (args.dataSources ?? []).length > 0 ? noNewsLine(args.name, args.dataSources ?? []) : null,
    cases: premium ? cases : null,
    caseCount: history.kind === "direction" || history.kind === "baseline" || history.kind === "earnings" ? history.n : cases.length,
    trader:
      premium && hasBand
        ? {
            thresholdPct: 5,
            bandLow: row.probability_low as number,
            bandHigh: row.probability_high as number,
            sampleSize: row.sample_size,
            confidence: row.confidence_level,
            readings: args.factors.map((f) => ({
              label: String(f.detail.label ?? f.factor_key),
              value: f.value,
              percentile: f.percentile,
              stateLabel: (f.detail.state_label as string | null | undefined) ?? null,
            })),
          }
        : null,
    plan,
  };
}
