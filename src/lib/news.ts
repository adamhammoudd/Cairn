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

// RSS providers hand us headlines with HTML entities still encoded, so titles
// render as "Nvidia&#x2019;s" verbatim. Decoded at display time rather than on
// ingest so already-stored rows are fixed too.
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(apos|#39);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
