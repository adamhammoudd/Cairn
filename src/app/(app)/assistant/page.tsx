import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/actions/settings";
import { getBetaAccessLabel } from "@/lib/actions/billing";
import { ChatThread } from "@/components/chat/chat-thread";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [settings, betaUntil] = await Promise.all([getUserSettings(), getBetaAccessLabel()]);

  return (
    <div className="animate-page-in">
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Assistant</div>
        <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
          Ask Cairn
        </h1>
        <p className="mt-2 max-w-[540px] text-[13.5px] leading-[1.55] text-muted text-pretty">
          Grounded in your holdings, the last close, and the filings and headlines Cairn has indexed. Every answer
          shows its sources, historical analogs, and confidence - and never advises on your personal positions.
        </p>
      </div>

      <ChatThread
        expandMethodology={settings?.assistant_expand_methodology ?? true}
        betaUntil={betaUntil}
        usePortfolioContext={settings?.assistant_use_portfolio_context ?? true}
      />
    </div>
  );
}
