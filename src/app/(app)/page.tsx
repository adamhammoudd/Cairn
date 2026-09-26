import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { summaryLine, type AnalysisRowLike } from "@/lib/analysis-display";
import { createClient } from "@/lib/supabase/server";
import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { computeHoldingMetrics, computeTimelineSeries, computeTotals } from "@/lib/portfolio";
import { getLatestCloses, latestDataDate } from "@/lib/market-data/current-price";
import { readRecentPrices } from "@/lib/market-data/paged-read";

import { guardReads } from "@/components/data-unavailable";
import { loadDailyBriefing } from "@/lib/daily-briefing-data";

// A failed market-data read renders the panel instead of throwing into a
// minified React error; anything else propagates as before.
export default async function DashboardPage() {
  return guardReads(DashboardBody);
}



// Base Camp's hero chart offers its own ranges rather than following
// Settings > Display > "Default chart timeframe". It draws from the daily
// close series with no intraday path, so the setting's 1D would give it a
// single point - the range the real charts serve from the provider instead.
// 1W and up are drawable from stored closes, so those are what it offers, and
// it opens on the month.
//
// Ranges with fewer than two stored closes are dropped before they reach the
// component, so the control never shows a button that renders an empty box.
const DASHBOARD_TIMEFRAMES = ["1W", "1M", "3M", "1Y"] as const;
const DASHBOARD_DEFAULT_TIMEFRAME = "1M" as const;

async function DashboardBody() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [settingsRes, holdingsRes, watchlistsRes, newsRes, sessionsRes, alertsRes, analysesRes] = await Promise.all([
    supabase.from("user_settings").select("refresh_rate_seconds").eq("user_id", user.id).maybeSingle(),
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
    // Service role: migration 0053 closed ai_analyses to signed-in reads (the
    // row carries the Premium >=5% band). Only the headline and history line
    // are passed on.
    createAdminClient()
      .from("ai_analyses")
      .select(
        "id, reasoning_text, plain_summary, headline, text_source, confidence_level, sample_size, scope_type, scope_value, analysis_type, created_at, direction_n, direction_higher, direction_horizon_sessions, direction_confidence, direction_p25, direction_median, direction_p75, direction_worst, direction_best",
      )
      .eq("status", "validated")
      // Current analyses only: a regenerated one supersedes the old (migration 0054).
      .is("superseded_by", null)
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
  // Ground truth for the crypto-quote hint - see the same note on the
  // Portfolio page for why this can't be inferred from historical_prices bars.
  const assetTypeBySymbol = new Map(holdings.map((h) => [h.symbol, h.asset_type]));
  const closes = await getLatestCloses(symbols, undefined, assetTypeBySymbol);
  const metrics = computeHoldingMetrics(holdings, closes);
  const totals = computeTotals(metrics, closes);

  // Same per-symbol window the Portfolio page uses, and the same timeframe, so
  // the dashboard's summary sparkline and the full chart cannot disagree about
  // the same portfolio. (Ordered ascending with no limit, this returned the
  // OLDEST rows under PostgREST's cap.)
  // Paged: one call is capped at 1000 rows, which covered NVDA alone for four holdings.
  const priceRows = await readRecentPrices(supabase, symbols, 1500);
  // One series per offered range, off the single `priceRows` read above -
  // computeTimelineSeries only slices and sums what it is given, so four
  // ranges cost four passes over rows already in memory, not four queries.
  const portfolioSeries: Partial<Record<(typeof DASHBOARD_TIMEFRAMES)[number], { values: number[]; dates: string[] }>> = {};
  for (const timeframe of DASHBOARD_TIMEFRAMES) {
    const points = computeTimelineSeries(holdings, priceRows, timeframe);
    if (points.length > 1) {
      portfolioSeries[timeframe] = {
        values: points.map((p) => p.value),
        dates: points.map((p) => p.date),
      };
    }
  }

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

  // The strip under the header. It is drawn from the same screen the Markets
  // card reads, so the two cannot disagree about a symbol's day - holdings
  // first, because a moving band the reader does not own is wallpaper, then
  // the rest of the screen's movers to fill the track out. Capped, because
  // beyond ~18 the loop is long enough that a symbol leaves and does not come
  // back inside a glance.
  const heldOrder = new Map(symbols.map((sym, i) => [sym, i]));
  const tickerItems = marketRows
    .filter((r) => r.changePct !== null)
    .sort((a, b) => {
      const aHeld = heldOrder.get(a.symbol);
      const bHeld = heldOrder.get(b.symbol);
      if (aHeld !== undefined && bHeld !== undefined) return aHeld - bHeld;
      if (aHeld !== undefined) return -1;
      if (bHeld !== undefined) return 1;
      return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
    })
    .slice(0, 18)
    .map((r) => ({ symbol: r.symbol, changePct: r.changePct ?? 0 }));

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
    ? await createAdminClient()
        .from("ai_analysis_sources")
        .select("*", { count: "exact", head: true })
        .eq("analysis_id", latestAnalysisRow.id)
    : { count: 0 };
  // The headline the analysis weighted most - shown on the card as a real
  // source, not a placeholder. Two small reads, only when an analysis exists.
  let topSource: { title: string; source: string; publishedAt: string } | null = null;
  if (latestAnalysisRow) {
    // Service role, as above: the sources policy checks the parent through
    // ai_analyses (closed to signed-in reads by migration 0053).
    const { data: topLink } = await createAdminClient()
      .from("ai_analysis_sources")
      .select("news_item_id")
      .eq("analysis_id", latestAnalysisRow.id)
      .order("weight", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (topLink) {
      const { data: item } = await supabase
        .from("news_items")
        .select("title, source_name, published_at")
        .eq("id", topLink.news_item_id)
        .maybeSingle();
      if (item) topSource = { title: item.title, source: item.source_name, publishedAt: item.published_at };
    }
  }
  const latestAnalysis = latestAnalysisRow
    ? {
        quote: summaryLine(latestAnalysisRow as unknown as AnalysisRowLike, latestAnalysisRow.scope_value, null).headline,
        sourceCount: latestSourceCount ?? 0,
        sampleSize: latestAnalysisRow.sample_size,
        confidenceLevel: latestAnalysisRow.confidence_level,
        scopeType: latestAnalysisRow.scope_type,
        scopeValue: latestAnalysisRow.scope_value,
        analysisType: latestAnalysisRow.analysis_type,
        historyLine: summaryLine(latestAnalysisRow as unknown as AnalysisRowLike, latestAnalysisRow.scope_value, null).historyLine,
        createdAt: latestAnalysisRow.created_at,
        topSource,
      }
    : null;

  const today = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  // One freshness statement for the whole dashboard, from the same store every
  // card reads.
  const dataAsOf = await latestDataDate(Array.from(new Set([...symbols, ...watchlistSymbols, ...topMarketRows.map((r) => r.symbol)])));

  // "What changed for what you own" leads the page (feat/daily-briefing).
  const briefing = await loadDailyBriefing(user.id);
  const briefingDate = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <DashboardHome
      briefing={briefing}
      briefingDate={briefingDate}
      refreshRateSeconds={settingsRes.data?.refresh_rate_seconds ?? 30}
      dataAsOf={dataAsOf}
      today={today}
      tickerItems={tickerItems}
      portfolio={{
        // Raw USD, formatted in the client component through the shared
        // display-prefs formatter. Formatting here would have pinned Base
        // Camp's headline figure to dollars while Holdings and Markets
        // followed the currency setting.
        totalValue: totals.totalValue,
        totalGain: totals.totalGain,
        totalGainPct: totals.totalGainPct,
        positive: totals.totalGain >= 0,
        positions: holdings.length,
        series: portfolioSeries,
        defaultTimeframe: DASHBOARD_DEFAULT_TIMEFRAME,
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
