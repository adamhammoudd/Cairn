import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { DashboardHome, MODULE_KEYS, type ModuleKey } from "@/components/dashboard/dashboard-home";
import { computeHoldingMetrics, computeTotals } from "@/lib/portfolio";
import { getLatestCloses } from "@/lib/market-data/current-price";

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [settingsRes, holdingsRes, watchlistsRes, newsRes, sessionsRes, briefingRes] = await Promise.all([
    supabase.from("user_settings").select("dashboard_layout").eq("user_id", user.id).maybeSingle(),
    supabase.from("holdings").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("watchlists").select("id, name").eq("user_id", user.id).order("sort_order", { ascending: true }),
    supabase.from("news_items").select("id, title").order("published_at", { ascending: false }).limit(1),
    supabase
      .from("chat_sessions")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("daily_briefings")
      .select("briefing_date")
      .eq("user_id", user.id)
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const watchlistItemsRes = await supabase
    .from("watchlist_items")
    .select("symbol")
    .in(
      "watchlist_id",
      (watchlistsRes.data ?? []).map((w) => w.id),
    );

  const holdings = holdingsRes.data ?? [];
  const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  const closes = await getLatestCloses(symbols);
  const metrics = computeHoldingMetrics(holdings, closes);
  const totals = computeTotals(metrics, closes);

  const [marketRows] = await Promise.all([runScreen(EMPTY_FILTERS)]);
  const assetTypeCounts = marketRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.assetType] = (acc[row.assetType] ?? 0) + 1;
    return acc;
  }, {});
  const featuredType =
    Object.entries(assetTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed";

  const watchlistSymbols = new Set((watchlistItemsRes.data ?? []).map((item) => item.symbol));

  const rawLayout = (settingsRes.data?.dashboard_layout as string[] | null) ?? [];
  const initialLayout = rawLayout.filter((key): key is ModuleKey => (MODULE_KEYS as string[]).includes(key));

  return (
    <DashboardHome
      initialLayout={initialLayout}
      portfolio={{
        totalValue: fmtCurrency(totals.totalValue),
        totalGain: `${totals.totalGain >= 0 ? "+" : ""}${fmtCurrency(totals.totalGain)}`,
        positions: holdings.length,
      }}
      markets={{
        trackedSymbols: marketRows.length,
        featuredType: featuredType.toUpperCase(),
      }}
      watchlist={{
        lists: watchlistsRes.data?.length ?? 0,
        symbols: watchlistSymbols.size,
        topListName: watchlistsRes.data?.[0]?.name ?? "No active list",
      }}
      news={{
        articles: Number(newsRes.data?.length ?? 0),
        headline: newsRes.data?.[0]?.title ?? "Latest market update",
      }}
      assistant={{
        sessions: sessionsRes.data?.length ?? 0,
        briefingDate: briefingRes.data?.briefing_date ?? null,
      }}
    />
  );
}
