import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { MODULE_KEYS, type ModuleKey } from "@/lib/dashboard-modules";
import { computeHoldingMetrics, computeTimelineSeries, computeTotals, type PriceBar } from "@/lib/portfolio";
import { getLatestCloses, latestDataDate } from "@/lib/market-data/current-price";


// The Portfolio page's chart opens on 1M; the dashboard's summary sparkline
// plots the same window from the same series so a reader moving between them
// sees the same shape.
const DASHBOARD_SPARKLINE_TIMEFRAME = "1M" as const;

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
    supabase.from("user_settings").select("dashboard_layout, refresh_rate_seconds").eq("user_id", user.id).maybeSingle(),
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

  // Same per-symbol window the Portfolio page uses, and the same timeframe, so
  // the dashboard's summary sparkline and the full chart cannot disagree about
  // the same portfolio. (Ordered ascending with no limit, this returned the
  // OLDEST rows under PostgREST's cap.)
  const { data: priceRows } =
    symbols.length > 0
      ? await supabase.rpc("recent_prices", { symbols, per_symbol: 1500 })
      : { data: [] };
  const sparklineSeries = computeTimelineSeries(holdings, (priceRows ?? []) as PriceBar[], DASHBOARD_SPARKLINE_TIMEFRAME);
  const sparkline = sparklineSeries.map((p) => p.value);

  // Direction of the sparkline itself, so the dashboard's line is coloured by
  // what it draws (1M) rather than by all-time gain, which is a different
  // number and was the only one this card had.
  const sparklinePositive = sparkline.length > 1 ? sparkline[sparkline.length - 1] >= sparkline[0] : true;

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
  // One freshness statement for the whole dashboard, from the same store every
  // card reads.
  const dataAsOf = await latestDataDate(Array.from(new Set([...symbols, ...watchlistSymbols, ...topMarketRows.map((r) => r.symbol)])));

  return (
    <DashboardHome
      refreshRateSeconds={settingsRes.data?.refresh_rate_seconds ?? 30}
      dataAsOf={dataAsOf}
      initialLayout={initialLayout}
      today={today}
      portfolio={{
        totalValue: fmtCurrency(totals.totalValue),
        totalGain: `${totals.totalGain >= 0 ? "+" : ""}${fmtCurrency(totals.totalGain)}`,
        totalGainPct: totals.totalGainPct,
        positive: totals.totalGain >= 0,
        positions: holdings.length,
        sparkline,
        sparklinePositive,
        sparklineTimeframe: DASHBOARD_SPARKLINE_TIMEFRAME,
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
