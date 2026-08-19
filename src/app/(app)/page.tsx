import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { DashboardHome, MODULE_KEYS, type ModuleKey } from "@/components/dashboard/dashboard-home";
import { computeHoldingMetrics, computeTimelineSeries, computeTotals } from "@/lib/portfolio";
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

  const [settingsRes, holdingsRes, watchlistsRes, newsRes, sessionsRes, alertsRes, analysesRes] = await Promise.all([
    supabase.from("user_settings").select("dashboard_layout").eq("user_id", user.id).maybeSingle(),
    supabase.from("holdings").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("watchlists").select("id, name").eq("user_id", user.id).order("sort_order", { ascending: true }),
    supabase
      .from("news_items")
      .select("id, title, source_name, published_at, tickers")
      .order("published_at", { ascending: false })
      .limit(20),
    supabase
      .from("chat_sessions")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("alerts").select("id, last_triggered_at").eq("user_id", user.id).eq("enabled", true),
    supabase
      .from("ai_analyses")
      .select("id, reasoning_text, confidence_level, sample_size")
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1),
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

  const { data: priceRows } =
    symbols.length > 0
      ? await supabase.from("historical_prices").select("*").in("symbol", symbols).order("ts", { ascending: true })
      : { data: [] };
  const sparkline = computeTimelineSeries(holdings, priceRows ?? [], "1M").map((p) => p.value);

  const topHoldings = [...metrics]
    .filter((m) => m.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3)
    .map((m) => ({ symbol: m.symbol, gainPct: m.gainPct ?? 0 }));

  const marketRows = await runScreen(EMPTY_FILTERS);
  const topMarketRows = marketRows
    .filter((r) => r.price !== null && r.changePct !== null)
    .slice(0, 4)
    .map((r) => ({ symbol: r.symbol, price: r.price ?? 0, changePct: r.changePct ?? 0 }));

  const watchlistSymbols = new Set((watchlistItemsRes.data ?? []).map((item) => item.symbol));
  const watchlistCloses = await getLatestCloses(Array.from(watchlistSymbols));
  const topMovers = Array.from(watchlistSymbols)
    .map((symbol) => {
      const c = watchlistCloses.get(symbol);
      const pct = c?.latest && c?.prev ? ((c.latest - c.prev) / c.prev) * 100 : null;
      return { symbol, pct };
    })
    .filter((m): m is { symbol: string; pct: number } => m.pct !== null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 3);

  const today0 = new Date().toISOString().slice(0, 10);
  const alertsPastThreshold = (alertsRes.data ?? []).filter(
    (a) => a.last_triggered_at && a.last_triggered_at.slice(0, 10) === today0,
  ).length;

  const newsItems = (newsRes.data ?? []).slice(0, 3).map((n) => {
    const tickers: string[] = n.tickers ?? [];
    const tint: "accent" | "violet" | "warning" = tickers.some((t) => symbols.includes(t))
      ? "accent"
      : tickers.some((t) => watchlistSymbols.has(t))
        ? "violet"
        : "warning";
    return { title: n.title, source: n.source_name, publishedAt: n.published_at, tint };
  });

  const latestAnalysisRow = analysesRes.data?.[0] ?? null;
  const { count: latestSourceCount } = latestAnalysisRow
    ? await supabase
        .from("ai_analysis_sources")
        .select("*", { count: "exact", head: true })
        .eq("analysis_id", latestAnalysisRow.id)
    : { count: 0 };
  const latestAnalysis = latestAnalysisRow
    ? {
        quote: latestAnalysisRow.reasoning_text,
        sourceCount: latestSourceCount ?? 0,
        sampleSize: latestAnalysisRow.sample_size,
        confidenceLevel: latestAnalysisRow.confidence_level,
      }
    : null;

  const rawLayout = (settingsRes.data?.dashboard_layout as string[] | null) ?? [];
  const initialLayout = rawLayout.filter((key): key is ModuleKey => (MODULE_KEYS as string[]).includes(key));

  const today = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <DashboardHome
      initialLayout={initialLayout}
      today={today}
      portfolio={{
        totalValue: fmtCurrency(totals.totalValue),
        totalGain: `${totals.totalGain >= 0 ? "+" : ""}${fmtCurrency(totals.totalGain)}`,
        totalGainPct: totals.totalGainPct,
        positive: totals.totalGain >= 0,
        positions: holdings.length,
        sparkline,
        topHoldings,
      }}
      markets={{
        trackedSymbols: marketRows.length,
        top: topMarketRows,
      }}
      watchlist={{
        lists: watchlistsRes.data?.length ?? 0,
        symbols: watchlistSymbols.size,
        alertsPastThreshold,
        topMovers,
      }}
      news={{
        articles: Number(newsRes.data?.length ?? 0),
        items: newsItems,
      }}
      assistant={{
        sessions: sessionsRes.data?.length ?? 0,
        latestAnalysis,
      }}
    />
  );
}
