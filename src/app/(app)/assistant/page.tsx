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
    <div>
      <div>
        <div>AI Assistant</div>
        <h1>Ask, with sources</h1>
        <p>
          Market, sector, and ticker analysis — every answer shows its sources, historical analogs, and confidence.
          Cairn never advises on your personal positions.
        </p>
      </div>

      <div>
        <div>
          <BriefingCard briefing={briefing} analyses={analyses} analysisDepth={TIER_LIMITS[plan].analysisDepth} />
        </div>
        <div>
          <ChatThread />
        </div>
      </div>
    </div>
  );
}
