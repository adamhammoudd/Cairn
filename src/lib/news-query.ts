// The News feed's database query, shared by the server action
// (lib/actions/news.ts) and the pagination suite, which runs this exact query
// read-only against the live table. Plain module: a "use server" file may
// only export async functions.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { parseNewsSearch, type NewsFilter, type NewsRelevance } from "@/lib/news";
import { normalizeSectorsForMatching } from "@/lib/sectors";

export const NEWS_COLUMNS = "id, title, url, source_name, published_at, tickers, sectors";

export interface NewsInterests {
  tracked: string[];
  /** Tagger slugs (news_items.sectors form) the user has stated on a holding. */
  sectorSlugs: string[];
}

export async function readNewsInterests(supabase: SupabaseClient<Database>): Promise<NewsInterests> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { tracked: [], sectorSlugs: [] };
  const [holdingsRes, watchlistItemsRes] = await Promise.all([
    supabase.from("holdings").select("symbol, sector").eq("user_id", user.id),
    supabase.from("watchlist_items").select("symbol"),
  ]);
  const tracked = new Set([...(holdingsRes.data ?? []).map((h) => h.symbol), ...(watchlistItemsRes.data ?? []).map((w) => w.symbol)]);
  // "raw:" keys are stated sectors the tagger has no slug for - they can never
  // match a stored tag, so they are left out of the database filter.
  const sectorSlugs = [...normalizeSectorsForMatching((holdingsRes.data ?? []).map((h) => h.sector))].filter((s) => !s.startsWith("raw:"));
  return { tracked: [...tracked], sectorSlugs };
}

/** "{A,B}" for a PostgREST array literal; symbols/slugs are quoted so a "." or "-" is safe. */
const arrayLiteral = (values: string[]) => `{${values.map((v) => `"${v.replace(/["\\]/g, "")}"`).join(",")}}`;

export function classifyNews(a: { tickers: string[] | null; sectors: string[] | null }, interests: NewsInterests): { relevance: NewsRelevance; matchedOn: string[] } {
  const tracked = new Set(interests.tracked);
  const tickerMatches = (a.tickers ?? []).filter((t) => tracked.has(t));
  if (tickerMatches.length > 0) return { relevance: "holding", matchedOn: tickerMatches };
  const stated = new Set(interests.sectorSlugs);
  // The *original* tag is what gets reported as the match, so the reason shown
  // to the reader is the story's own wording.
  const sectorMatches = (a.sectors ?? []).filter((s) => [...normalizeSectorsForMatching([s])].some((n) => stated.has(n)));
  if (sectorMatches.length > 0) return { relevance: "sector", matchedOn: sectorMatches };
  return { relevance: "general", matchedOn: [] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyNewsFilter<Q extends { overlaps: any; not: any; or: any; contains: any; ilike: any }>(query: Q, filter: NewsFilter, interests: NewsInterests, search: string, ticker?: string): Q | null {
  let q = query;
  if (filter === "holding") {
    if (interests.tracked.length === 0) return null;
    q = q.overlaps("tickers", interests.tracked);
  } else if (filter === "sector") {
    if (interests.sectorSlugs.length === 0) return null;
    // A story about a held ticker is "holding" tier, not "sector", however it is tagged.
    q = q.overlaps("sectors", interests.sectorSlugs);
    if (interests.tracked.length > 0) q = q.not("tickers", "ov", arrayLiteral(interests.tracked));
  } else if (filter === "general") {
    if (interests.tracked.length > 0) q = q.not("tickers", "ov", arrayLiteral(interests.tracked));
    if (interests.sectorSlugs.length > 0) q = q.not("sectors", "ov", arrayLiteral(interests.sectorSlugs));
  }
  if (ticker) q = q.contains("tickers", [ticker]);
  const s = parseNewsSearch(search);
  // Quoted: "." is reserved in the or() grammar ("BRK.B").
  if (s.ticker && s.keyword) q = q.or(`tickers.cs.${arrayLiteral([s.ticker])},title.ilike."*${s.keyword}*"`);
  else if (s.keyword) q = q.ilike("title", `%${s.keyword}%`);
  return q;
}

