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

// ---------------------------------------------------------------------------
// Pagination (feat/news-pagination).
//
// Keyset, not offset: pages are ordered by (published_at DESC, id DESC) and
// the next page starts strictly after the last row of this one. Offsets skip
// or repeat rows whenever ingest-news inserts while someone is paging, and
// ~1,000 groups of stored articles share a published_at, so the id tie-break
// is what makes "strictly after" well defined.
//
// Relevance ranking (holdings, then sectors, then the rest) is applied WITHIN
// each page. The cursor always comes from the page's oldest row by
// (published_at, id), never from the display order, so re-ranking a page can
// never create a gap or a repeat.
// ---------------------------------------------------------------------------

export const NEWS_PAGE_SIZE = 40;

export type NewsFilter = "all" | NewsRelevance;

export interface NewsCursor {
  publishedAt: string;
  id: string;
}

export interface NewsPage {
  items: NewsFeedItem[];
  /** Null when this is the last page. */
  nextCursor: NewsCursor | null;
}

/** Strictly after `cursor` in (published_at DESC, id DESC) order. The reference for the DB filter below. */
export function isAfterCursor(row: { published_at: string; id: string }, cursor: NewsCursor | null): boolean {
  if (!cursor) return true;
  const a = Date.parse(row.published_at);
  const b = Date.parse(cursor.publishedAt);
  if (a !== b) return a < b;
  return row.id < cursor.id;
}

/**
 * The same predicate as a PostgREST `or` filter. Timestamps are quoted: they
 * contain ":" and "+", which the filter grammar reserves.
 */
export function keysetOrFilter(cursor: NewsCursor): string {
  // Passed through exactly as the database returned it: re-serialising via
  // Date would cut microseconds, and a tie at microsecond precision would then
  // skip or repeat rows. Validated so a cursor can't smuggle in a clause.
  const at = cursor.publishedAt;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(at)) throw new Error("Invalid news cursor");
  if (!/^[0-9a-f-]{36}$/i.test(cursor.id)) throw new Error("Invalid news cursor");
  return `published_at.lt."${at}",and(published_at.eq."${at}",id.lt.${cursor.id})`;
}

/**
 * Rows arrive newest-first with ONE extra row fetched beyond the page size:
 * its presence is how we know another page exists, without a count query.
 */
export function pageFromRows<T extends { published_at: string; id: string }>(rows: T[], limit: number = NEWS_PAGE_SIZE): { rows: T[]; nextCursor: NewsCursor | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page, nextCursor: rows.length > limit && last ? { publishedAt: last.published_at, id: last.id } : null };
}

const RANK: Record<NewsRelevance, number> = { holding: 0, sector: 1, general: 2 };

/** Holdings first, then sectors, then the rest; newest first inside each tier. */
export function rankWithinPage(items: NewsFeedItem[]): NewsFeedItem[] {
  return [...items].sort((a, b) => {
    const r = RANK[a.relevance] - RANK[b.relevance];
    if (r !== 0) return r;
    return a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : a.id < b.id ? 1 : -1;
  });
}

export interface NewsSearch {
  /** An exact ticker to match in `tickers`, when the query looks like one. */
  ticker: string | null;
  /** Words to match in the title (trigram index, migration 0056). */
  keyword: string | null;
}

/**
 * "$nvda" / "NVDA" / "nvda" -> ticker NVDA (a single short word also matches
 * titles, so "tesla" still finds Tesla stories). Anything else is a title
 * keyword. Characters the filter grammar or ILIKE treat specially are
 * dropped, so a query can never widen itself into a pattern or a new clause.
 */
export function parseNewsSearch(raw: string): NewsSearch {
  const cleaned = raw.replace(/[^\p{L}\p{N}\s'&.$-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (cleaned.length < 2 && !/^\$?[A-Za-z]$/.test(cleaned)) return { ticker: null, keyword: null };
  const single = cleaned.match(/^\$?([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?)$/);
  const keyword = cleaned.replace(/^\$/, "").replace(/[$]/g, "");
  if (single) return { ticker: single[1].toUpperCase(), keyword: keyword.length >= 2 ? keyword : null };
  return { ticker: null, keyword: keyword.length >= 2 ? keyword : null };
}
