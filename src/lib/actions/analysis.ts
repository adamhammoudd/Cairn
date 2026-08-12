"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateAnalysis } from "@/lib/ai/generate";
import { checkAiUsageAllowed, recordAiUsage } from "@/lib/actions/billing";
import type { ScopeType } from "@/lib/supabase/types";

export async function requestAnalysis(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const scopeType = formData.get("scope_type") as ScopeType;
  const scopeValue = String(formData.get("scope_value") ?? "").trim();

  if (!scopeValue) return "Enter a market, sector, or ticker to analyze.";

  const gate = await checkAiUsageAllowed(user.id);
  if (!gate.allowed) return gate.message ?? "AI analysis limit reached for this plan.";

  try {
    await generateAnalysis({ scopeType, scopeValue: scopeType === "ticker" ? scopeValue.toUpperCase() : scopeValue });
  } catch (err) {
    return err instanceof Error ? err.message : "Failed to generate analysis.";
  }

  await recordAiUsage(user.id);

  revalidatePath("/research");
  if (scopeType === "ticker") revalidatePath(`/ticker/${scopeValue.toUpperCase()}`);
  return "saved";
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
// briefing, chat citations) — Phase 6 requires the same component with the
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
