import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayBriefing } from "@/lib/actions/briefing";
import { BriefingCard } from "@/components/briefing/briefing-card";
import { ChatThread } from "@/components/chat/chat-thread";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const briefing = await getTodayBriefing();

  return (
    <div className="grid h-full grid-cols-[1fr_420px] gap-6">
      <div className="flex flex-col gap-6 overflow-y-auto">
        <BriefingCard briefing={briefing} />
      </div>
      <div className="flex flex-col overflow-hidden rounded-card border border-line bg-panel">
        <ChatThread />
      </div>
    </div>
  );
}
