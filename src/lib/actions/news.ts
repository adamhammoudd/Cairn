"use server";

import { getAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  keysetOrFilter,
  NEWS_PAGE_SIZE,
  pageFromRows,
  rankWithinPage,
  type NewsCursor,
  type NewsFeedItem,
  type NewsFilter,
  type NewsPage,
} from "@/lib/news";
import { applyNewsFilter, classifyNews, readNewsInterests, NEWS_COLUMNS } from "@/lib/news-query";

// Relevance ranking: holdings/watchlist tickers first, then sectors the user
// has explicitly typed onto a holding (the closest thing to a stated
// interest that exists in the schema today), then everything else by
// recency. No separate "preferences" table exists yet -- holdings.sector is
// real, user-entered data, not a fabricated signal.
//
// Both sides go through lib/sectors.ts before they are compared. They used to
// be compared as raw strings, so a holding typed as "Technology" never matched
// a story the tagger wrote as "technology", and the whole "Your sectors" filter
// worked only when the user happened to type the tagger's exact slug.
//
// The feed used to be the newest 60 rows, ranked, with filters and search
// applied in the browser to those 60 - of 18,814 stored. It is now paged with
// a keyset cursor (lib/news.ts), 40 at a time, and the filters and search run
// in the database, so "Your holdings" and a search reach the whole archive.

export interface NewsPageRequest {
  filter?: NewsFilter;
  /** Ticker or title keyword. */
  search?: string;
  /** Only stories tagged with this ticker (the ticker page's news list). */
  ticker?: string;
  cursor?: NewsCursor | null;
  limit?: number;
}

/** One page of the feed: newest-first by (published_at, id), ranked by relevance within the page. */
export async function getNewsPage(req: NewsPageRequest = {}): Promise<NewsPage> {
  if (!(await getAuthUser())) return { items: [], nextCursor: null };
  const supabase = await createClient();
  const interests = await readNewsInterests(supabase);
  const limit = Math.min(Math.max(req.limit ?? NEWS_PAGE_SIZE, 1), 100);

  let query = supabase.from("news_items").select(NEWS_COLUMNS);
  if (req.cursor) query = query.or(keysetOrFilter(req.cursor));
  const filtered = applyNewsFilter(query, req.filter ?? "all", interests, req.search ?? "", req.ticker?.toUpperCase());
  if (!filtered) return { items: [], nextCursor: null };

  const { data, error } = await filtered.order("published_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (error) throw new Error(`News read failed: ${error.message}`);

  const { rows, nextCursor } = pageFromRows(data ?? [], limit);
  const items: NewsFeedItem[] = rows.map((a) => ({
    id: a.id,
    title: a.title,
    url: a.url,
    source_name: a.source_name,
    published_at: a.published_at,
    tickers: a.tickers ?? [],
    sectors: a.sectors ?? [],
    ...classifyNews(a, interests),
  }));
  return { items: rankWithinPage(items), nextCursor };
}

/**
 * Stories per filter across the whole archive (not the loaded page), for the
 * filter chips. Head-only counts on indexed columns.
 */
export async function getNewsCounts(search = ""): Promise<Record<NewsFilter, number>> {
  // Session required: a server action is a public POST endpoint, whatever page the proxy guards.
  if (!(await getAuthUser())) return { all: 0, holding: 0, sector: 0, general: 0 };
  const supabase = await createClient();
  const interests = await readNewsInterests(supabase);
  const filters: NewsFilter[] = ["all", "holding", "sector", "general"];
  const counts = await Promise.all(
    filters.map(async (f) => {
      const q = applyNewsFilter(supabase.from("news_items").select("id", { count: "exact", head: true }), f, interests, search);
      if (!q) return 0;
      const { count } = await q;
      return count ?? 0;
    }),
  );
  return Object.fromEntries(filters.map((f, i) => [f, counts[i]])) as Record<NewsFilter, number>;
}
