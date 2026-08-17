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
    <div className="animate-page-in flex h-full flex-col gap-4">
      <div>
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">AI Assistant</div>
        <h1 className="font-serif text-[32px] leading-tight font-normal text-primary">Ask, with sources</h1>
        <p className="mt-1.5 max-w-[620px] text-[13.5px] text-muted text-pretty">
          Market, sector, and ticker analysis — every answer shows its sources, historical analogs, and confidence.
          Cairn never advises on your personal positions.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 xl:grid-cols-[1fr_420px]">
        <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto">
          <BriefingCard briefing={briefing} analyses={analyses} analysisDepth={TIER_LIMITS[plan].analysisDepth} />
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-panel">
          <ChatThread />
        </div>
      </div>
    </div>
  );
}
