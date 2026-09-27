// The ticker half of generateAnalysis (lib/ai/generate.ts): read the
// scorecard, the similar-moment conditions and the calendar, have the model
// write the text (lib/ai/analysis-text.ts), and hand back what to store.
// Every rejected draft is written to the service-only ai_scope_guard_log.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ProbabilityBand } from "@/lib/ai/analytics";
import type { FactorAnalysis } from "@/lib/ai/factor-analysis";
import { loadScorecard } from "@/lib/scorecard-data";
import { loadConditionData, similarMoments, type SimilarMoments } from "@/lib/ai/similar-moments-data";
import { generateAnalysisText, type GeneratedText, type TextInputs } from "@/lib/ai/analysis-text";
import { directionColumns, textInputsFor, type NewsRow } from "@/lib/ai/ticker-analysis";
import { historyInPlainWords } from "@/lib/ai/history-plain";
import { checkCompleteness } from "@/lib/ai/scope-guard";

type Insert = Database["public"]["Tables"]["ai_analyses"]["Insert"];

/** What a writer (ticker text, or the legacy sector/market prose) hands back to generateAnalysis. */
export interface Written {
  analysisType: string;
  reasoningText: string;
  modelVersion: string;
  columns: Partial<Insert>;
  plainSummary: Record<string, unknown> | null;
  /** Dates of the cases the direction was counted from (their analog rows get in_direction_set). */
  directionDates: Set<string>;
  /** The history the direction came from (ticker scopes): which basis, which cases. */
  sm?: SimilarMoments | null;
}

export const CALENDAR_DAYS_AHEAD = 60;

/** Everything the ticker text is written from, read once. Exported for the regeneration dry run. */
export async function tickerTextInputs(a: {
  supabase: SupabaseClient<Database>;
  symbol: string;
  name: string;
  assetType: string | null;
  factorAnalysis: FactorAnalysis | null;
  band: ProbabilityBand;
  news: NewsRow[];
  today?: string;
}) {
  const today = a.today ?? new Date().toISOString().slice(0, 10);
  const bundle = await loadScorecard(a.symbol, { supabase: a.supabase, today });
  const data = await loadConditionData(a.supabase, a.symbol, today, bundle.pricesAsc);
  const fa = a.factorAnalysis;
  const sm = fa ? similarMoments({ set: fa.set, result: fa.result, assetType: a.assetType, scorecard: bundle.scorecard, data, today }) : null;
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + CALENDAR_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);
  const { data: calendar, error } = await a.supabase
    .from("calendar_events")
    .select("id, event_type, event_date, metadata")
    .eq("symbol", a.symbol)
    .in("event_type", ["earnings", "ex_dividend", "dividend"])
    .gte("event_date", today)
    .lte("event_date", until)
    .order("event_date")
    .limit(3);
  if (error) throw new Error(`Failed to read calendar for ${a.symbol}: ${error.message}`);
  const inputs: TextInputs = textInputsFor({ name: a.name, symbol: a.symbol, assetType: a.assetType, factorAnalysis: fa, sm, scorecard: bundle.scorecard, calendar: calendar ?? [], news: a.news, band: a.band });
  return { inputs, sm, scorecard: bundle.scorecard, today };
}

export async function writeTickerText(a: {
  supabase: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  symbol: string;
  name: string;
  assetType: string | null;
  factorAnalysis: FactorAnalysis | null;
  band: ProbabilityBand;
  news: NewsRow[];
  sourceCount: number;
  analogCount: number;
  generate?: (i: TextInputs) => Promise<GeneratedText>;
}): Promise<Written> {
  const { inputs, sm, scorecard } = await tickerTextInputs(a);
  const g = await (a.generate ?? generateAnalysisText)(inputs);

  for (const at of g.attempts) {
    if (!at.draft) {
      console.warn(`[analysis] ${a.symbol}: model draft unavailable (${at.reason}): ${at.evidence ?? ""}`);
      continue;
    }
    await a.admin.from("ai_scope_guard_log").insert({ raw_output: JSON.stringify(at.draft), flagged: true, flag_reason: at.reason, source_surface: "analysis" });
  }

  const reasoningText = [g.text.headline, ...g.text.bullets].join(" ");
  // Defense in depth, as before: never a bare figure without sources and cases.
  const complete = checkCompleteness({ reasoning_text: reasoningText, source_count: a.sourceCount, historical_analog_count: a.analogCount, sample_size: a.band.sampleCount });
  if (!complete.passed) throw new Error(`Analysis for ${a.symbol} failed the completeness gate (${complete.reason}).`);

  // The ticker page still reads plain_summary until feat/analysis-display-v2;
  // it gets the same text and a history counted from the same cases.
  // The plain summary's history counts similar moments; a base rate has none.
  const history = sm && sm.kind === "similar"
    ? historyInPlainWords({
        name: a.name,
        assetType: a.assetType,
        horizonSessions: sm.history.horizonSessions,
        instances: sm.cases.map((c) => ({ date: c.date, priceBefore: c.priceBefore, priceAfter: c.priceAfter })),
        conditions: sm.factorConditions.map((c) => ({ key: c.key, state: c.state })),
      })
    : null;

  return {
    analysisType: "directional_history",
    reasoningText,
    modelVersion: g.source === "model" ? (g.model ?? "unknown") : "cairn:template",
    columns: directionColumns(sm, g),
    plainSummary: {
      version: 1,
      headline: g.text.headline,
      bullets: g.text.bullets,
      source: g.source,
      failure: g.attempts.length > 0 ? g.attempts[g.attempts.length - 1].reason : null,
      generatedAt: new Date().toISOString(),
      scorecard,
      history,
    },
    directionDates: new Set(sm?.history.cases.map((c) => c.date) ?? []),
    sm,
  };
}
