// Everything the "Generate analysis" button does after the quota gate:
// ingest the symbol's history, generate, and turn every failure into the
// outcome the reader sees. lib/actions/analysis.ts wraps this with auth, the
// quota reservation and cache revalidation; scripts (the coverage sweep, the
// read-only harness) call it directly, so they measure the path users hit
// rather than a copy of it.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ScopeType } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAnalysis } from "@/lib/ai/generate";
import { BUSY_MESSAGE, GENERIC_ERROR_MESSAGE, SYMBOL_UNAVAILABLE_MESSAGE, DATA_BUSY_MESSAGE, type GenerateOutcome } from "@/lib/analysis";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import { FACTOR_HISTORY_RANGE, TARGET_FACTOR_HISTORY_BARS, benchmarkSymbolFor } from "@/lib/ai/factors";
import { loadBars } from "@/lib/ai/factor-analysis";
import { isTooYoung, youngHistory } from "@/lib/ai/history-depth";
import { LlmBusyError } from "@/lib/ai/llm";
import { AnalysisDataGap, describeGap, explainGaps } from "@/lib/analysis-gaps";
import { plainName } from "@/lib/ai/ticker-analysis";

/** A GenerateOutcome, plus the canonical symbol and the stored row on success (for revalidation and scripts). */
export type PipelineOutcome =
  | { ok: true; analysisId: string; scopeValue: string; stored: Record<string, unknown> }
  | Exclude<GenerateOutcome, { ok: true }>;

// Everything after the quota gate. Every non-ok return here refunds the slot
// (see runAnalysisGeneration), so a symbol that turns out not to exist, thin
// data or a provider failure never costs the user one.
export async function generateForScope(
  scopeType: ScopeType,
  initialScopeValue: string,
  /** A client for the reads, for a script with no request scope (see generateAnalysis). */
  opts: { supabaseClient?: SupabaseClient<Database> } = {},
): Promise<PipelineOutcome> {
  let scopeValue = initialScopeValue;
  let assetType: string | null = null;

  // Precondition, not a second pipeline: make sure the symbol's price history
  // is on disk before any analysis is attempted. A symbol nobody has asked
  // about is fetched here on first use; one already present costs a single
  // indexed read (ensureSymbolIngested is cached, rate-limited and dedups
  // in-flight calls). Only ticker scopes have a price history to ingest.
  //
  // Runs after the quota gate; a symbol that turns out not to exist is
  // refunded like any other failure.
  if (scopeType === "ticker") {
    try {
      // Deeper history than a chart needs: the factor analog scan measures
      // percentiles of the symbol's own past, and ~2 years is too few episodes
      // to produce an adequate sample. minBars re-fetches a symbol we already
      // hold only at the shallower default.
      const ingest = await ensureSymbolIngested(scopeValue, {
        range: FACTOR_HISTORY_RANGE,
        minBars: TARGET_FACTOR_HISTORY_BARS,
      });
      if (ingest.status === "unavailable") {
        return { ok: false, kind: "error", message: SYMBOL_UNAVAILABLE_MESSAGE };
      }
      if (ingest.status !== "available") {
        return { ok: false, kind: "error", message: DATA_BUSY_MESSAGE };
      }
      // The provider's canonical form (BTC-USD is stored as BTC), which is what
      // the price history is keyed by.
      scopeValue = ingest.symbol;
      assetType = ingest.assetType;
    } catch (err) {
      console.error("[analysis] ingestion precondition failed", {
        scopeValue,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, kind: "error", message: GENERIC_ERROR_MESSAGE };
    }
  }

  let analysisId: string;
  let stored: Record<string, unknown>;
  try {
    // generateAnalysis runs the scope guard internally and refuses to store a
    // flagged output - a chat-triggered run gets that same guard precisely
    // because it comes through here rather than around it.
    const analysis = await generateAnalysis({ scopeType, scopeValue, supabaseClient: opts.supabaseClient });
    analysisId = analysis.id;
    stored = analysis as unknown as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate analysis.";
    if (err instanceof AnalysisDataGap) {
      const kind = err.assetType ?? assetType;
      const name = scopeType === "ticker" ? plainName(err.displayName ?? scopeValue, scopeValue, kind) : scopeValue;
      const gap = explainGaps(err.gaps, name, kind);
      console.warn("[analysis] unavailable", { scopeType, scopeValue, reasons: err.gaps.map(describeGap) });
      const young = scopeType === "ticker" && gap.reasons.includes("short_history") ? await describeYoungHistory(scopeValue, kind) : null;
      return { ok: false, kind: "unavailable", message: gap.message, gap, ...(young ? { young } : {}) };
    }
    // Everything below here used to `return { message }` with the exception's
    // own text. On a provider 429 that text is the provider's error body -
    // org id, model id, service tier, remaining quota - and it rendered
    // verbatim in the browser. The same path also carried up to 500 characters
    // of raw model output when a JSON parse failed. The detail belongs in the
    // server log; the user gets a fixed string.
    console.error("[analysis] generation failed", {
      scopeType,
      scopeValue,
      error: message,
    });
    if (err instanceof LlmBusyError) {
      return { ok: false, kind: "error", message: BUSY_MESSAGE };
    }
    return { ok: false, kind: "error", message: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, analysisId, scopeValue, stored };
}

/**
 * When a ticker failed as thin data because it is genuinely young (fewer
 * stored bars than the factor scan needs), say so plainly, with a labelled
 * benchmark base rate where one exists. Null when the symbol has enough
 * history - then the failure is something else and keeps the generic wording.
 * Best effort: a read failure here falls back to the generic panel rather
 * than turning a data gap into an error.
 */
export async function describeYoungHistory(symbol: string, assetType: string | null) {
  try {
    // Prices are public data; the service role only avoids a request-scope dependency.
    const db = createAdminClient();
    const bars = await loadBars(db, symbol);
    if (!isTooYoung(bars.length)) return null;
    const benchmark = benchmarkSymbolFor(symbol, assetType);
    const benchmarkBars = benchmark ? await loadBars(db, benchmark) : [];
    return youngHistory(symbol, bars.length, assetType, benchmarkBars);
  } catch (err) {
    console.error("[analysis] young-history read failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

