import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAnalyses } from "@/lib/actions/analysis";
import { getEventsForScopes } from "@/lib/actions/calendar";
import { getUserPlan } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import { RequestForm } from "@/components/analysis/request-form";
import { MethodologyCard } from "@/components/analysis/methodology-card";

export default async function ResearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [analyses, plan] = await Promise.all([listAnalyses(), getUserPlan()]);
  const depth = TIER_LIMITS[plan].analysisDepth;
  const eventsByScope = await getEventsForScopes(
    Array.from(new Set(analyses.filter((a) => a.scope_type === "ticker").map((a) => a.scope_value))),
  );

  return (
    <div>
      <RequestForm />

      {analyses.length === 0 ? (
        <div>
          No analyses yet. Request one above — market, sector, or ticker level only.
        </div>
      ) : (
        <div>
          {analyses.map((a) => (
            <MethodologyCard key={a.id} analysis={a} depth={depth} upcomingEvents={eventsByScope[a.scope_value] ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
