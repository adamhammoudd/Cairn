// Build the plain summary for a freshly validated ticker analysis and store it
// on the analysis row (migration 0049). Never throws: a summary that cannot be
// built leaves the analysis exactly as it was, and the page falls back to the
// code-built template at render time.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadScorecard } from "@/lib/scorecard-data";
import { historyInPlainWords, type HistoryPlain } from "@/lib/ai/history-plain";
import { generatePlainSummary, type PlainSummary } from "@/lib/ai/plain-summary";
import type { FactorAnalysis } from "@/lib/ai/factor-analysis";
import type { Scorecard } from "@/lib/scorecard";

export interface StoredPlainSummary extends PlainSummary {
  version: 1;
  scorecard: Scorecard;
  history: HistoryPlain | null;
}

/** The engine's analog result in plain words, or null when it found no usable set. */
export function historyFromFactors(name: string, assetType: string | null, fa: FactorAnalysis | null): HistoryPlain | null {
  if (!fa || !fa.result.ok) return null;
  const { analogs } = fa.result;
  return historyInPlainWords({
    name,
    assetType,
    horizonSessions: analogs.horizonSessions,
    instances: analogs.instances.map((i) => ({ date: i.date, priceBefore: i.priceBefore, priceAfter: i.priceAfter })),
    conditions: analogs.conditions.map((c) => ({ key: c.key, state: c.state })),
  });
}

export async function attachPlainSummary(args: {
  analysisId: string;
  symbol: string;
  assetType: string | null;
  factorAnalysis: FactorAnalysis | null;
  supabase: SupabaseClient<Database>;
}): Promise<StoredPlainSummary | null> {
  try {
    const { data: dir } = await args.supabase.from("symbol_directory").select("name").eq("symbol", args.symbol).maybeSingle();
    const name = (dir?.name as string | undefined) ?? args.symbol;
    const bundle = await loadScorecard(args.symbol, { supabase: args.supabase });
    const history = historyFromFactors(name, args.assetType, args.factorAnalysis);
    const summary = await generatePlainSummary({ name, symbol: args.symbol, assetType: args.assetType, scorecard: bundle.scorecard, history });
    const stored: StoredPlainSummary = { version: 1, ...summary, scorecard: bundle.scorecard, history };
    const { error } = await createAdminClient()
      .from("ai_analyses")
      .update({ plain_summary: stored as unknown as Record<string, unknown> })
      .eq("id", args.analysisId);
    if (error) throw new Error(error.message);
    return stored;
  } catch (err) {
    console.warn(`[cairn] plain summary not stored for ${args.symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
