import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAnalyses, listPinnedAnalysisIds } from "@/lib/actions/analysis";
import { getBillingSummary } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import { ResearchWorkspace } from "@/components/analysis/research-workspace";
// Shared with the chat quota panel so both surfaces name the reset date the
// same way - see lib/chat-state.ts.
import { nextResetLabel } from "@/lib/chat-state";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Research - Cairn" };

export default async function ResearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [analyses, pinnedIds, usage, { data: holdings }, { data: fundamentals }] = await Promise.all([
    listAnalyses(),
    listPinnedAnalysisIds(),
    // Same shared plan gate every billing-gated feature routes through -
    // getBillingSummary() reads getUserPlan()'s tier plus this month's
    // ai_usage_events count, so the quota shown here is the quota enforced.
    getBillingSummary(),
    supabase.from("holdings").select("symbol").eq("user_id", user.id),
    supabase.from("fundamentals").select("sector"),
  ]);

  const heldSymbols = Array.from(new Set((holdings ?? []).map((h) => h.symbol)));
  const sectors = Array.from(
    new Set((fundamentals ?? []).map((f) => f.sector).filter((s): s is string => !!s)),
  ).sort();

  return (
    <ResearchWorkspace
      analyses={analyses}
      heldSymbols={heldSymbols}
      sectors={sectors}
      planLabel={TIER_LIMITS[usage.tier].label}
      usage={{ used: usage.used, limit: usage.limit, unlimited: usage.unlimited }}
      resetLabel={nextResetLabel()}
      pinnedIds={pinnedIds}
    />
  );
}
