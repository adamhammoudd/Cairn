"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateAnalysis } from "@/lib/ai/generate";
import { checkAiUsageAllowed, recordAiUsage } from "@/lib/actions/billing";
import { UNAVAILABLE_MESSAGE, type GenerateOutcome } from "@/lib/analysis";
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

  const gate = await checkAiUsageAllowed(user.id);
  if (!gate.allowed) {
    return { ok: false, kind: "quota", message: gate.message ?? "AI analysis limit reached for this plan." };
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
    return { ok: false, kind: "error", message };
  }

  await recordAiUsage(user.id);

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
 * uses to pick relevant context.
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
  const mentioned = detectTickers(message);
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
async function attachMethodology(
  supabase: Awaited<ReturnType<typeof createClient>>,
  analyses: BareAnalysis[],
): Promise<AnalysisWithMethodology[]> {
  if (analyses.length === 0) return [];

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
      .filter((e): e is NonNullable<typeof e> => !!e),
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

  const { data: analyses } = await supabase.from("ai_analyses").select("*").in("id", ids);
  return attachMethodology(supabase, analyses ?? []);
}
