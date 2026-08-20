import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayBriefing } from "@/lib/actions/briefing";
import { getAnalysesByIds } from "@/lib/actions/analysis";
import { getUserPlan } from "@/lib/actions/billing";
import { getUserSettings } from "@/lib/actions/settings";
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
  const [analyses, plan, settings] = await Promise.all([
    getAnalysesByIds(briefing?.analyses.map((a) => a.id) ?? []),
    getUserPlan(),
    getUserSettings(),
  ]);

  return (
    <div className="animate-page-in">
      <div className="mb-4.5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">AI Assistant</div>
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">Ask, with sources</h1>
        <p className="mt-1.75 max-w-[640px] text-[13.5px] text-muted text-pretty">
          Market, sector, and ticker analysis - every answer shows its sources, historical analogs, and confidence.
          Cairn never advises on your personal positions.
        </p>
      </div>

      <ChatThread
        expandMethodology={settings?.assistant_expand_methodology ?? true}
        briefing={<BriefingCard briefing={briefing} analyses={analyses} analysisDepth={TIER_LIMITS[plan].analysisDepth} />}
      />
    </div>
  );
}
