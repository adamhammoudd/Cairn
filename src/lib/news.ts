// Types for the news feed. Kept out of lib/actions/news.ts for the same
// reason as lib/screener.ts / lib/comparison.ts -- a "use server" module may
// only export async functions.

export type NewsRelevance = "holding" | "sector" | "general";

export interface NewsFeedItem {
  id: string;
  title: string;
  url: string | null;
  source_name: string;
  published_at: string;
  tickers: string[];
  sectors: string[];
  relevance: NewsRelevance;
  matchedOn: string[];
}
