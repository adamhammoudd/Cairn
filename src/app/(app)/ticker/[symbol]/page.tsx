import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTickerDetail } from "@/lib/actions/ticker";
import { getAnalysesForScope } from "@/lib/actions/analysis";
import { listThreadsForSymbol } from "@/lib/actions/discussion";
import { listWatchlists } from "@/lib/actions/watchlists";
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

  const [analyses, discussion, plan, holdingRows, watchlistRows] = await Promise.all([
    getAnalysesForScope("ticker", data.symbol),
    listThreadsForSymbol(data.symbol),
    getUserPlan(),
    // The header reads "<name> · <held>" in the mock, and the Watch control
    // needs the user lists to add to. Both are RLS-scoped to this user.
    supabase.from("holdings").select("quantity, purchase_price").eq("symbol", data.symbol),
    listWatchlists(),
  ]);

  const held = holdingRows.data ?? [];
  const heldQuantity = held.reduce((sum, h) => sum + Number(h.quantity ?? 0), 0);
  // Weighted average entry across every lot of this symbol, matching the
  // "$X avg" the mock prints beside the held quantity.
  const avgCost =
    heldQuantity > 0
      ? held.reduce((sum, h) => sum + Number(h.quantity ?? 0) * Number(h.purchase_price ?? 0), 0) / heldQuantity
      : null;
  const watchlists = watchlistRows.map((w) => ({
    id: w.id,
    name: w.name,
    hasSymbol: w.items.some((i) => i.symbol === data.symbol),
  }));

  return (
    <TickerWorkspace
      data={data}
      analyses={analyses}
      discussion={discussion}
      analysisDepth={TIER_LIMITS[plan].analysisDepth}
      heldQuantity={heldQuantity}
      avgCost={avgCost}
      watchlists={watchlists}
    />
  );
}
