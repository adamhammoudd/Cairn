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

  let analysisQuery = supabase
    .from("ai_analyses")
    .select("id, scope_value, analysis_type, probability_low, probability_high, confidence_level")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(10);
  if (symbols.length > 0) analysisQuery = analysisQuery.in("scope_value", symbols);
  const { data: analyses } = await analysisQuery;

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

  const analysisList = analyses ?? [];
  const eventList = events ?? [];

  let summary: string;
  if (symbols.length === 0) {
    summary = sources.includeHoldings
      ? "No holdings or watchlist symbols yet - add some to get a personalized relevance ranking, or ask the assistant about any market/sector/ticker directly."
      : "The watchlists feeding this briefing are empty, and holdings are switched off as a source in Settings. Add symbols, or turn holdings back on, to get a relevance ranking.";
  } else if (analysisList.length === 0 && eventList.length === 0 && news.length === 0) {
    summary = `No new research, upcoming events, or matching stories for your ${symbols.length} tracked symbol${symbols.length === 1 ? "" : "s"} since your last briefing.`;
  } else {
    const parts: string[] = [];
    if (analysisList.length > 0) {
      parts.push(
        `${analysisList.length} relevant analysis${analysisList.length === 1 ? "" : "es"}: ${analysisList
          .slice(0, 3)
          .map((a) => `${a.scope_value} (${a.probability_low}–${a.probability_high}%, ${a.confidence_level} confidence)`)
          .join(", ")}${analysisList.length > 3 ? ", and more" : ""}.`,
      );
    }
    if (eventList.length > 0) {
      parts.push(
        `${eventList.length} upcoming event${eventList.length === 1 ? "" : "s"}: ${eventList
          .slice(0, 3)
          .map((e) => `${e.symbol ?? ""} ${e.event_type} on ${e.event_date}`.trim())
          .join(", ")}${eventList.length > 3 ? ", and more" : ""}.`,
      );
    }
    if (news.length > 0) {
      parts.push(
        `${news.length} story${news.length === 1 ? "" : " stories"} in your chosen news categories.`,
      );
    }
    summary = parts.join(" ");
  }

  const content: BriefingContent = {
    generated_at: new Date().toISOString(),
    relevant_symbols: symbols,
    summary,
    analyses: analysisList,
    upcoming_events: eventList,
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
