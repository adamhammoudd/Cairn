import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayBriefing } from "@/lib/actions/briefing";
import { getAnalysesByIds } from "@/lib/actions/analysis";
import { getUserPlan } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import { BriefingCard } from "@/components/briefing/briefing-card";
import { ChatThread } from "@/components/chat/chat-thread";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const briefing = await getTodayBriefing();
  const [analyses, plan] = await Promise.all([
    getAnalysesByIds(briefing?.analyses.map((a) => a.id) ?? []),
    getUserPlan(),
  ]);

  return (
    <div className="grid h-full grid-cols-[1fr_420px] gap-6">
      <div className="flex flex-col gap-6 overflow-y-auto">
        <BriefingCard briefing={briefing} analyses={analyses} analysisDepth={TIER_LIMITS[plan].analysisDepth} />
      </div>
      <div className="flex flex-col overflow-hidden rounded-card border border-line bg-panel">
        <ChatThread />
      </div>
    </div>
  );
}
