import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAnalyses } from "@/lib/actions/analysis";
import { getEventsForScopes } from "@/lib/actions/calendar";
import { getBillingSummary } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import { ResearchWorkspace } from "@/components/analysis/research-workspace";

// First of next month, spelled the way the mockup's quota copy spells it
// ("1 September") - the same boundary startOfCurrentMonthIso() counts from.
function nextResetLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getDate()} ${next.toLocaleDateString(undefined, { month: "long" })}`;
}

export default async function ResearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [analyses, usage, { data: holdings }, { data: fundamentals }] = await Promise.all([
    listAnalyses(),
    // Same shared plan gate every billing-gated feature routes through -
    // getBillingSummary() reads getUserPlan()'s tier plus this month's
    // ai_usage_events count, so the quota shown here is the quota enforced.
    getBillingSummary(),
    supabase.from("holdings").select("symbol").eq("user_id", user.id),
    supabase.from("fundamentals").select("sector"),
  ]);

  const depth = TIER_LIMITS[usage.tier].analysisDepth;

  const eventsByScope = await getEventsForScopes(
    Array.from(new Set(analyses.filter((a) => a.scope_type === "ticker").map((a) => a.scope_value))),
  );

  const heldSymbols = Array.from(new Set((holdings ?? []).map((h) => h.symbol)));
  const sectors = Array.from(
    new Set((fundamentals ?? []).map((f) => f.sector).filter((s): s is string => !!s)),
  ).sort();

  return (
    <ResearchWorkspace
      analyses={analyses}
      eventsByScope={eventsByScope}
      heldSymbols={heldSymbols}
      sectors={sectors}
      depth={depth}
      planLabel={TIER_LIMITS[usage.tier].label}
      usage={{ used: usage.used, limit: usage.limit }}
      resetLabel={nextResetLabel()}
    />
  );
}
