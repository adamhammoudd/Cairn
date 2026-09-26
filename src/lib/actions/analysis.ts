"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateAnalysis } from "@/lib/ai/generate";
import { getUserPlan } from "@/lib/actions/billing";
import { reserveAiUsage, releaseAiUsage } from "@/lib/ai-usage";
import {
  UNAVAILABLE_MESSAGE,
  BUSY_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  SYMBOL_UNAVAILABLE_MESSAGE,
  DATA_BUSY_MESSAGE,
  type GenerateOutcome,
} from "@/lib/analysis";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import { FACTOR_HISTORY_RANGE, TARGET_FACTOR_HISTORY_BARS } from "@/lib/ai/factors";
import { LlmBusyError } from "@/lib/ai/llm";
import { detectTickers } from "@/lib/ai/context";
import type { ScopeType } from "@/lib/supabase/types";

/**
 * The single generation pipeline. Both entry points - the Research page's
 * "Generate analysis" button and a chat-triggered inline generation - call
 * runAnalysisGeneration below, so quota accounting, the scope guard, storage
 * and the user-facing failure language cannot drift between them. Do not add
 * a second path.
 */

// Failures from lib/ai/generate.ts that mean "the record is too thin here",
// as opposed to something actually broken. Matched against the shapes that
// module throws; anything else stays an "error" and is reported as such
// rather than being dressed up as a data gap.
function isThinDataFailure(message: string): boolean {
  return (
    message.includes("No news or historical event data") ||
    message.includes("No historical analogs with usable before/after prices") ||
    message.includes("an analysis must cite at least one source")
  );
  // "Not enough price history to derive factor-based analogs" is a sub-case of
  // the second phrase above (same thrown message), so it needs no line of its own.
}

export async function runAnalysisGeneration(
  scopeType: ScopeType,
  rawScopeValue: string,
): Promise<GenerateOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const scopeValue = scopeType === "ticker" ? rawScopeValue.trim().toUpperCase() : rawScopeValue.trim();
  if (!scopeValue) {
    return { ok: false, kind: "error", message: "Enter a market, sector, or ticker to analyze." };
  }

  // The slot is taken here, before the seconds of ingestion and generation,
  // and handed back below if no analysis comes out. Counting here and recording
  // at the end let every request in flight while one slot was left through.
  const gate = await reserveAiUsage(user.id);
  if (!gate.allowed) {
    return { ok: false, kind: "quota", message: gate.message };
  }
  let outcome: GenerateOutcome;
  try {
    outcome = await generateWithinReservation(scopeType, scopeValue);
  } catch (err) {
    await releaseAiUsage(gate.reservationId);
    throw err;
  }
  if (!outcome.ok) await releaseAiUsage(gate.reservationId);
  return outcome;
}

// Everything after the quota gate. Every non-ok return here refunds the slot
// (see runAnalysisGeneration), so a symbol that turns out not to exist, thin
// data or a provider failure never costs the user one.
async function generateWithinReservation(scopeType: ScopeType, initialScopeValue: string): Promise<GenerateOutcome> {
  let scopeValue = initialScopeValue;

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
    } catch (err) {
      console.error("[analysis] ingestion precondition failed", {
        scopeValue,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, kind: "error", message: GENERIC_ERROR_MESSAGE };
    }
  }

  let analysisId: string;
  try {
    // generateAnalysis runs the scope guard internally and refuses to store a
    // flagged output - a chat-triggered run gets that same guard precisely
    // because it comes through here rather than around it.
    const analysis = await generateAnalysis({ scopeType, scopeValue });
    analysisId = analysis.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate analysis.";
    if (isThinDataFailure(message)) {
      return { ok: false, kind: "unavailable", message: UNAVAILABLE_MESSAGE };
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

  revalidatePath("/research");
  if (scopeType === "ticker") revalidatePath(`/ticker/${scopeValue}`);

  return { ok: true, analysisId };
}

/**
 * "Did they ask about a scope we have nothing on file for?"
 *
 * Deliberately the same existence check the Research page's library runs -
 * getAnalysesForScope returning nothing - rather than a second, chat-specific
 * notion of missing. Scope detection is chat's own detectTickers, so what
 * counts as "the scope they asked about" matches what the assistant already
 * uses to pick relevant context. detectTickers only ever returns symbols the
 * market-data directory resolved as available - a delisted ticker or a typo the
 * provider refused never reaches this function - and runAnalysisGeneration
 * re-checks that before doing any work, so neither can be tricked into a
 * generation that would fail expensively.
 *
 * Returns null when the message names no single scope, or when something is
 * already on file. Only ever offers ticker scopes: sector and market-wide
 * research stays a deliberate Research-page action.
 *
 * Called from both the chat route (which acts on it) and the chat client
 * (which shows the generating state while the route works), so the two can
 * never disagree about whether a generation is happening.
 */
export async function findMissingAnalysisScope(
  message: string,
): Promise<{ scopeType: ScopeType; scopeValue: string } | null> {
  const mentioned = await detectTickers(message);
  // More than one ticker in the question is ambiguous - generating for a guess
  // would be the silent auto-generation this is explicitly not meant to do.
  if (mentioned.length !== 1) return null;

  const scopeValue = mentioned[0];
  const existing = await getAnalysesForScope("ticker", scopeValue);
  if (existing.length > 0) return null;

  return { scopeType: "ticker", scopeValue };
}

export async function requestAnalysis(_prevState: string | null, formData: FormData) {
  const scopeType = formData.get("scope_type") as ScopeType;
  const scopeValue = String(formData.get("scope_value") ?? "");

  const outcome = await runAnalysisGeneration(scopeType, scopeValue);
  return outcome.ok ? "saved" : outcome.message;
}

export interface AnalysisWithMethodology {
  id: string;
  scope_type: ScopeType;
  scope_value: string;
  analysis_type: string;
  probability_low: number;
  probability_high: number;
  confidence_level: string;
  sample_size: number;
  reasoning_text: string;
  model_version: string;
  created_at: string;
  sources: { id: string; title: string; source_name: string; url: string | null; published_at: string }[];
  analogs: {
    id: string;
    symbol: string | null;
    sector: string | null;
    event_type: string;
    event_date: string;
    description: string | null;
    similarity_score: number;
    note: string | null;
  }[];
}

type BareAnalysis = Omit<AnalysisWithMethodology, "sources" | "analogs">;

// Shared by every surface that renders MethodologyCard (research page, daily
// briefing, chat citations) - Phase 6 requires the same component with the
// same data everywhere, so the enrichment query lives in exactly one place.
//
// PLAN GATE. The Free/Premium analog-depth difference is enforced HERE, not in
// the component. MethodologyCard's `depth` prop still decides what it draws,
// but a server action's return value is readable directly - a Free account
// could open devtools and read the full premium analog set straight out of the
// payload while the UI showed one. RLS does not help: ai_analysis_* rows are
// market-scoped and readable by every account by design. So the rows a Free
// plan may not see are dropped before they are ever serialized.
//
// What is NOT gated, deliberately: the finding, the probability range,
// confidence level, sample_size, sources, and the low-confidence warning. Those
// are the honesty guarantee and they are identical on both plans - see the
// `depth` docs on MethodologyCardProps.
async function attachMethodology(
  supabase: Awaited<ReturnType<typeof createClient>>,
  analyses: BareAnalysis[],
): Promise<AnalysisWithMethodology[]> {
  if (analyses.length === 0) return [];

  // Free sees the single closest analog. sample_size on the analysis row still
  // reports the true count, so "1 of 7 shown" and the upgrade note stay honest
  // without shipping the other six.
  const analogLimit = (await getUserPlan()) === "free" ? 1 : Infinity;

  const ids = analyses.map((a) => a.id);

  const [{ data: sourceLinks }, { data: analogLinks }] = await Promise.all([
    supabase.from("ai_analysis_sources").select("analysis_id, news_item_id").in("analysis_id", ids),
    supabase
      .from("ai_analysis_historical_analogs")
      .select("analysis_id, historical_event_id, similarity_score, note")
      .in("analysis_id", ids),
  ]);

  const newsIds = Array.from(new Set((sourceLinks ?? []).map((s) => s.news_item_id)));
  const eventIds = Array.from(new Set((analogLinks ?? []).map((a) => a.historical_event_id)));

  const [{ data: newsRows }, { data: eventRows }] = await Promise.all([
    newsIds.length > 0
      ? supabase.from("news_items").select("id, title, source_name, url, published_at").in("id", newsIds)
      : Promise.resolve({ data: [] }),
    eventIds.length > 0
      ? supabase
          .from("historical_events")
          .select("id, symbol, sector, event_type, event_date, description")
          .in("id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);

  const newsById = new Map((newsRows ?? []).map((n) => [n.id, n]));
  const eventById = new Map((eventRows ?? []).map((e) => [e.id, e]));

  return analyses.map((a) => ({
    ...a,
    sources: (sourceLinks ?? [])
      .filter((s) => s.analysis_id === a.id)
      .map((s) => newsById.get(s.news_item_id))
      .filter((n): n is NonNullable<typeof n> => !!n),
    analogs: (analogLinks ?? [])
      .filter((l) => l.analysis_id === a.id)
      .map((l) => {
        const event = eventById.get(l.historical_event_id);
        if (!event) return null;
        return { ...event, similarity_score: l.similarity_score, note: l.note };
      })
      .filter((e): e is NonNullable<typeof e> => !!e)
      // Closest match first, then truncate. Sorting before the slice is what
      // makes "the one analog Free sees" the best one rather than whichever
      // row the join happened to return first.
      .sort((x, y) => y.similarity_score - x.similarity_score)
      .slice(0, analogLimit),
  }));
}

export async function listAnalyses(): Promise<AnalysisWithMethodology[]> {
  const supabase = await createClient();

  const { data: analyses } = await supabase
    .from("ai_analyses")
    .select("*")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(20);

  return attachMethodology(supabase, analyses ?? []);
}

export async function getAnalysesForScope(scopeType: ScopeType, scopeValue: string): Promise<AnalysisWithMethodology[]> {
  const supabase = await createClient();

  const { data: analyses } = await supabase
    .from("ai_analyses")
    .select("*")
    .eq("status", "validated")
    .eq("scope_type", scopeType)
    .eq("scope_value", scopeValue)
    .order("created_at", { ascending: false })
    .limit(10);

  return attachMethodology(supabase, analyses ?? []);
}

export async function getAnalysesByIds(ids: string[]): Promise<AnalysisWithMethodology[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  // Validated only, like every other analysis read. Cited-by-id was the one
  // path without it, so an analysis withdrawn for being built on bad data
  // (migration 0047 withdrew a BTC one computed from ETF prices) still
  // rendered wherever a chat message had cited it.
  const { data: analyses } = await supabase.from("ai_analyses").select("*").in("id", ids).eq("status", "validated");
  return attachMethodology(supabase, analyses ?? []);
}

/**
 * The analysis ids this user has pinned, newest pin first.
 *
 * `ai_analyses` has no user_id - an analysis is market/sector/ticker-scoped and
 * read by every account - so a pin is a row in ai_analysis_pins rather than a
 * column on the analysis. See migration 0043.
 */
export async function listPinnedAnalysisIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("ai_analysis_pins")
    .select("analysis_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => row.analysis_id as string);
}

/**
 * Pin or unpin one analysis for the calling user. Returns an error string for
 * the caller to surface, or null on success - the same shape the other
 * mutating actions on this page use.
 *
 * Unpinning is a delete: a pin carries no mutable state, so there is nothing
 * to toggle in place, and migration 0043 grants no UPDATE policy.
 */
export async function toggleAnalysisPin(analysisId: string, pinned: boolean): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "You need to be signed in to pin an analysis.";

  if (pinned) {
    // upsert, not insert: double-clicking the star must not fail on the
    // composite primary key.
    const { error } = await supabase
      .from("ai_analysis_pins")
      .upsert({ user_id: user.id, analysis_id: analysisId }, { onConflict: "user_id,analysis_id" });
    // Same reason as the generation path above: a Postgres/PostgREST error
    // message names tables, columns and constraints. Log it, don't render it.
    if (error) {
      console.error("[analysis] pin failed", { analysisId, error: error.message });
      return "Couldn't pin that analysis. Please try again.";
    }
  } else {
    const { error } = await supabase
      .from("ai_analysis_pins")
      .delete()
      .eq("user_id", user.id)
      .eq("analysis_id", analysisId);
    if (error) {
      console.error("[analysis] unpin failed", { analysisId, error: error.message });
      return "Couldn't unpin that analysis. Please try again.";
    }
  }

  revalidatePath("/research");
  return null;
}
