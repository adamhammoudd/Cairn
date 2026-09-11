import { createClient } from "@/lib/supabase/server";
import { normalizeSectorsForMatching } from "@/lib/sectors";

export interface BriefingContent {
  generated_at: string;
  relevant_symbols: string[];
  summary: string;
  analyses: {
    id: string;
    scope_value: string;
    analysis_type: string;
    probability_low: number;
    probability_high: number;
    confidence_level: string;
  }[];
  upcoming_events: { symbol: string | null; event_type: string; event_date: string; title: string }[];
  /**
   * Last-session price move for each tracked symbol that moved more than
   * PRICE_MOVE_THRESHOLD_PCT, biggest absolute move first. Real closes from
   * historical_prices - never a live quote, never fabricated.
   */
  price_moves: { symbol: string; change_pct: number; close: number; as_of: string }[];
  /**
   * Recent stories that tag one of the reader's tracked symbols, regardless of
   * the news-category filter below - "news about what I hold" is always
   * relevant. Deduplicated against `news`.
   */
  symbol_news: { id: string; title: string; source_name: string; published_at: string; tickers: string[] }[];
  /**
   * Stories matching the reader's preferred news categories (Settings > AI
   * Assistant). Empty when no categories are chosen, which is the default and
   * the pre-settings behaviour.
   */
  news: { id: string; title: string; source_name: string; published_at: string; sectors: string[] }[];
  /**
   * What the briefing was built from, so the reader can tell why a symbol is
   * or isn't in it without opening Settings. Written by the generator, never
   * by hand.
   */
  sources: {
    holdings: boolean;
    watchlist_count: number;
    /** Null = every watchlist. */
    watchlist_ids: string[] | null;
    news_categories: string[];
  };
}

export interface BriefingSourceSettings {
  includeHoldings: boolean;
  /** Empty = every watchlist the user owns. */
  watchlistIds: string[];
  /** Empty = no category filter. Slugs from lib/sectors.ts. */
  newsCategories: string[];
}

export const DEFAULT_BRIEFING_SOURCES: BriefingSourceSettings = {
  includeHoldings: true,
  watchlistIds: [],
  newsCategories: [],
};

/** A symbol's last-session move is only worth a line if it cleared this. */
export const PRICE_MOVE_THRESHOLD_PCT = 2;

interface SummaryInput {
  symbolCount: number;
  includeHoldings: boolean;
  priceMoves: BriefingContent["price_moves"];
  analyses: BriefingContent["analyses"];
  events: BriefingContent["upcoming_events"];
  symbolNews: BriefingContent["symbol_news"];
  news: BriefingContent["news"];
}

/**
 * The one-paragraph briefing summary. Pure and exported so it can be tested
 * without a database, and so the scheduled Edge Function and the on-demand
 * path can't drift on wording (the Deno mirror hand-copies this).
 */
export function composeBriefingSummary(i: SummaryInput): string {
  if (i.symbolCount === 0) {
    return i.includeHoldings
      ? "No holdings or watchlist symbols yet - add some to get a personalized relevance ranking, or ask the assistant about any market/sector/ticker directly."
      : "The watchlists feeding this briefing are empty, and holdings are switched off as a source in Settings. Add symbols, or turn holdings back on, to get a relevance ranking.";
  }

  const plural = i.symbolCount === 1 ? "" : "s";
  if (
    i.priceMoves.length === 0 &&
    i.analyses.length === 0 &&
    i.events.length === 0 &&
    i.symbolNews.length === 0 &&
    i.news.length === 0
  ) {
    return `No notable price moves, new research, upcoming events, or stories for your ${i.symbolCount} tracked symbol${plural} since your last briefing.`;
  }

  const parts: string[] = [];
  if (i.priceMoves.length > 0) {
    parts.push(
      `${i.priceMoves.length} notable move${i.priceMoves.length === 1 ? "" : "s"}: ${i.priceMoves
        .slice(0, 3)
        .map((m) => `${m.symbol} ${m.change_pct > 0 ? "+" : ""}${m.change_pct}%`)
        .join(", ")}${i.priceMoves.length > 3 ? ", and more" : ""} (as of ${i.priceMoves[0].as_of}).`,
    );
  }
  if (i.analyses.length > 0) {
    // "analysis" pluralises irregularly - appending "es" reads as "analysises".
    parts.push(
      `${i.analyses.length} relevant ${i.analyses.length === 1 ? "analysis" : "analyses"}: ${i.analyses
        .slice(0, 3)
        .map((a) => `${a.scope_value} (${a.probability_low}–${a.probability_high}%, ${a.confidence_level} confidence)`)
        .join(", ")}${i.analyses.length > 3 ? ", and more" : ""}.`,
    );
  }
  if (i.events.length > 0) {
    parts.push(
      `${i.events.length} upcoming event${i.events.length === 1 ? "" : "s"}: ${i.events
        .slice(0, 3)
        .map((e) => `${e.symbol ?? ""} ${e.event_type} on ${e.event_date}`.trim())
        .join(", ")}${i.events.length > 3 ? ", and more" : ""}.`,
    );
  }
  if (i.symbolNews.length > 0) {
    parts.push(
      `${i.symbolNews.length} recent stor${i.symbolNews.length === 1 ? "y" : "ies"} on your holdings and watchlist.`,
    );
  }
  if (i.news.length > 0) {
    parts.push(`${i.news.length} story${i.news.length === 1 ? "" : " stories"} in your chosen news categories.`);
  }
  return parts.join(" ");
}

/**
 * Keeps only the newest analysis per scope_value, in whatever order they
 * arrived - the analyses query orders by created_at desc, so "newest" is
 * "first seen" here, no extra sort needed.
 *
 * Root cause (2026-09-04 walkthrough, item 6 quality pass): a symbol that
 * has been re-analyzed several times (real data - MSFT has three stored runs
 * a week apart, two of them landing on byte-identical figures) had every one
 * of those runs surface in the same briefing: "3 relevant analyses: MSFT
 * (20-64%, medium confidence), MSFT (10-57%, medium confidence), MSFT
 * (10-57%, medium confidence)." unchanged across four consecutive days. A
 * reader wants this symbol's current assessment, not its whole history
 * repeated - and three copies of one symbol crowd out whatever else the
 * briefing could have surfaced (the slice below only keeps the first 3).
 */
export function dedupeLatestPerSymbol<T extends { scope_value: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.scope_value)) return false;
    seen.add(r.scope_value);
    return true;
  });
}

/**
 * Last-session percentage move for each symbol, from the two most recent daily
 * closes in historical_prices. Symbols with fewer than two bars are skipped
 * (no move can be computed), never guessed.
 */
async function priceMovesFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  symbols: string[],
): Promise<BriefingContent["price_moves"]> {
  if (symbols.length === 0) return [];

  const { data: bars } = await supabase
    .from("historical_prices")
    .select("symbol, ts, close")
    .in("symbol", symbols)
    .order("ts", { ascending: false })
    .limit(symbols.length * 3);

  const bySymbol = new Map<string, { ts: string; close: number }[]>();
  for (const b of bars ?? []) {
    if (b.close === null) continue;
    const arr = bySymbol.get(b.symbol) ?? [];
    if (arr.length < 2) arr.push({ ts: b.ts, close: Number(b.close) });
    bySymbol.set(b.symbol, arr);
  }

  const moves: BriefingContent["price_moves"] = [];
  for (const [symbol, rows] of bySymbol) {
    if (rows.length < 2 || rows[1].close === 0) continue;
    const changePct = ((rows[0].close - rows[1].close) / rows[1].close) * 100;
    if (Math.abs(changePct) < PRICE_MOVE_THRESHOLD_PCT) continue;
    moves.push({
      symbol,
      change_pct: Math.round(changePct * 100) / 100,
      close: rows[0].close,
      as_of: rows[0].ts,
    });
  }
  return moves.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
}

/**
 * The symbols a briefing covers, given the reader's chosen sources.
 *
 * Deliberately not getUserSymbols(): that one is "everything this user
 * tracks", which is the right input for chat relevance ranking but the wrong
 * one here now that Settings lets someone say "brief me on my Semis watchlist,
 * not my whole portfolio". Turning that setting into a filter here is what
 * makes it a control rather than a stored string.
 */
async function briefingSymbols(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sources: BriefingSourceSettings,
): Promise<string[]> {
  const symbols = new Set<string>();

  if (sources.includeHoldings) {
    const { data: holdings } = await supabase.from("holdings").select("symbol").eq("user_id", userId);
    for (const h of holdings ?? []) symbols.add(h.symbol);
  }

  let listQuery = supabase.from("watchlists").select("id").eq("user_id", userId);
  if (sources.watchlistIds.length > 0) listQuery = listQuery.in("id", sources.watchlistIds);
  const { data: lists } = await listQuery;

  const listIds = (lists ?? []).map((l) => l.id);
  if (listIds.length > 0) {
    const { data: items } = await supabase.from("watchlist_items").select("symbol").in("watchlist_id", listIds);
    for (const i of items ?? []) symbols.add(i.symbol);
  }

  return Array.from(symbols);
}

// Deliberately deterministic, no LLM call: everything referenced here already
// passed the scope guard when it was generated (Phase 4), so templating it
// into a briefing can't introduce a new personal-directive or fabricated
// number the way a fresh generation call could.
export async function generateBriefing(userId: string): Promise<BriefingContent> {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("user_settings")
    .select("briefing_include_holdings, briefing_watchlist_ids, briefing_news_categories")
    .eq("user_id", userId)
    .maybeSingle();

  const sources: BriefingSourceSettings = settings
    ? {
        includeHoldings: settings.briefing_include_holdings ?? true,
        watchlistIds: settings.briefing_watchlist_ids ?? [],
        newsCategories: settings.briefing_news_categories ?? [],
      }
    : DEFAULT_BRIEFING_SOURCES;

  const symbols = await briefingSymbols(supabase, userId, sources);

  // Same conditional-filter bug the chat context had (see buildChatContext):
  // with no symbols to scope to, the `.in()` was skipped and the query
  // returned the newest validated analyses about anything at all - which is
  // how a briefing headed "Built from your holdings and every watchlist"
  // came to lead with AMZN for an account holding NVDA, ISRG and BTC.
  // No symbols means nothing to report on, not everything.
  const rawAnalyses =
    symbols.length > 0
      ? (
          await supabase
            .from("ai_analyses")
            .select("id, scope_value, analysis_type, probability_low, probability_high, confidence_level")
            .eq("status", "validated")
            .in("scope_value", symbols)
            .order("created_at", { ascending: false })
            .limit(10)
        ).data ?? []
      : [];
  const analyses = dedupeLatestPerSymbol(rawAnalyses);

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

  let eventsQuery = supabase
    .from("calendar_events")
    .select("symbol, event_type, event_date, title")
    .gte("event_date", today)
    .lte("event_date", twoWeeksOut.toISOString().slice(0, 10))
    .order("event_date", { ascending: true })
    .limit(10);
  if (symbols.length > 0) eventsQuery = eventsQuery.in("symbol", symbols);
  const { data: events } = await eventsQuery;

  // Preferred news categories. Matched through lib/sectors.ts rather than as
  // raw strings, for the same reason the news feed's relevance ranking is: the
  // tagger writes slugs and a stored preference must not have to spell one
  // exactly to match.
  const wanted = normalizeSectorsForMatching(sources.newsCategories);
  let news: BriefingContent["news"] = [];
  if (wanted.size > 0) {
    const { data: articles } = await supabase
      .from("news_items")
      .select("id, title, source_name, published_at, sectors")
      .order("published_at", { ascending: false })
      .limit(60);

    news = (articles ?? [])
      .filter((a) =>
        [...normalizeSectorsForMatching(a.sectors ?? [])].some((slug) => wanted.has(slug)),
      )
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.title,
        source_name: a.source_name,
        published_at: a.published_at,
        sectors: a.sectors ?? [],
      }));
  }

  // News that tags a tracked symbol - always relevant, independent of the
  // category filter. Last 10 days, so a stale story doesn't headline a briefing.
  let symbolNews: BriefingContent["symbol_news"] = [];
  if (symbols.length > 0) {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const { data: tagged } = await supabase
      .from("news_items")
      .select("id, title, source_name, published_at, tickers")
      .overlaps("tickers", symbols)
      .gte("published_at", tenDaysAgo.toISOString())
      .order("published_at", { ascending: false })
      .limit(6);
    const seen = new Set(news.map((n) => n.id));
    symbolNews = (tagged ?? [])
      .filter((a) => !seen.has(a.id))
      .map((a) => ({
        id: a.id,
        title: a.title,
        source_name: a.source_name,
        published_at: a.published_at,
        tickers: (a.tickers ?? []).filter((t: string) => symbols.includes(t)),
      }));
  }

  const priceMoves = await priceMovesFor(supabase, symbols);

  const analysisList = analyses ?? [];
  const eventList = events ?? [];

  const summary = composeBriefingSummary({
    symbolCount: symbols.length,
    includeHoldings: sources.includeHoldings,
    priceMoves,
    analyses: analysisList,
    events: eventList,
    symbolNews,
    news,
  });

  const content: BriefingContent = {
    generated_at: new Date().toISOString(),
    relevant_symbols: symbols,
    summary,
    analyses: analysisList,
    upcoming_events: eventList,
    price_moves: priceMoves,
    symbol_news: symbolNews,
    news,
    sources: {
      holdings: sources.includeHoldings,
      watchlist_count: sources.watchlistIds.length,
      watchlist_ids: sources.watchlistIds.length > 0 ? sources.watchlistIds : null,
      news_categories: sources.newsCategories,
    },
  };

  await supabase
    .from("daily_briefings")
    .upsert(
      { user_id: userId, briefing_date: today, content: content as unknown as Record<string, unknown> },
      { onConflict: "user_id,briefing_date" },
    );

  return content;
}
