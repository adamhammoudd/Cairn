import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTickerDetail } from "@/lib/actions/ticker";
import { getAnalysesForScope } from "@/lib/actions/analysis";
import { listThreadsForSymbol } from "@/lib/actions/discussion";
import { getUserPlan } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import { TickerWorkspace } from "@/components/ticker/ticker-workspace";

export default async function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getTickerDetail(symbol);
  if (!data) notFound();

  const [analyses, discussion, plan] = await Promise.all([
    getAnalysesForScope("ticker", data.symbol),
    listThreadsForSymbol(data.symbol),
    getUserPlan(),
  ]);

  return (
    <TickerWorkspace data={data} analyses={analyses} discussion={discussion} analysisDepth={TIER_LIMITS[plan].analysisDepth} />
  );
}
