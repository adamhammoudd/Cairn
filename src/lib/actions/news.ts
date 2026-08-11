"use server";

import { createClient } from "@/lib/supabase/server";
import type { NewsFeedItem, NewsRelevance } from "@/lib/news";

// Relevance ranking: holdings/watchlist tickers first, then sectors the user
// has explicitly typed onto a holding (the closest thing to a stated
// interest that exists in the schema today), then everything else by
// recency. No separate "preferences" table exists yet -- holdings.sector is
// real, user-entered data, not a fabricated signal.
export async function getNewsFeed(): Promise<NewsFeedItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: articles }, holdingsRes, watchlistItemsRes] = await Promise.all([
    supabase
      .from("news_items")
      .select("id, title, url, source_name, published_at, tickers, sectors")
      .order("published_at", { ascending: false })
      .limit(60),
    user
      ? supabase.from("holdings").select("symbol, sector").eq("user_id", user.id)
      : Promise.resolve({ data: [] as { symbol: string; sector: string | null }[] }),
    user ? supabase.from("watchlist_items").select("symbol") : Promise.resolve({ data: [] as { symbol: string }[] }),
  ]);

  const holdingSymbols = new Set((holdingsRes.data ?? []).map((h) => h.symbol));
  const watchlistSymbols = new Set((watchlistItemsRes.data ?? []).map((w) => w.symbol));
  const trackedSymbols = new Set([...holdingSymbols, ...watchlistSymbols]);
  const statedSectors = new Set(
    (holdingsRes.data ?? []).map((h) => h.sector).filter((s): s is string => Boolean(s)),
  );

  const scored = (articles ?? []).map((a) => {
    const tickerMatches = (a.tickers ?? []).filter((t) => trackedSymbols.has(t));
    const sectorMatches = (a.sectors ?? []).filter((s) => statedSectors.has(s));

    let relevance: NewsRelevance = "general";
    let matchedOn: string[] = [];
    if (tickerMatches.length > 0) {
      relevance = "holding";
      matchedOn = tickerMatches;
    } else if (sectorMatches.length > 0) {
      relevance = "sector";
      matchedOn = sectorMatches;
    }

    return {
      id: a.id,
      title: a.title,
      url: a.url,
      source_name: a.source_name,
      published_at: a.published_at,
      tickers: a.tickers ?? [],
      sectors: a.sectors ?? [],
      relevance,
      matchedOn,
    } satisfies NewsFeedItem;
  });

  const rank: Record<NewsRelevance, number> = { holding: 0, sector: 1, general: 2 };
  return scored.sort((a, b) => {
    const r = rank[a.relevance] - rank[b.relevance];
    if (r !== 0) return r;
    return a.published_at < b.published_at ? 1 : -1;
  });
}
