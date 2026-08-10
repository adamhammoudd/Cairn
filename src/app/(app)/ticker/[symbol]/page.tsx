import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTickerDetail } from "@/lib/actions/ticker";
import { getAnalysesForScope } from "@/lib/actions/analysis";
import { listThreadsForSymbol } from "@/lib/actions/discussion";
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

  const analyses = await getAnalysesForScope("ticker", data.symbol);
  const discussion = await listThreadsForSymbol(data.symbol);

  return <TickerWorkspace data={data} analyses={analyses} discussion={discussion} />;
}
