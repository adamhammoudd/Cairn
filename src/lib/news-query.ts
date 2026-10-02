// The News feed's database query, shared by the server action
// (lib/actions/news.ts) and the pagination suite, which runs this exact query
// read-only against the live table. Plain module: a "use server" file may
// only export async functions.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { parseNewsSearch, type NewsFilter, type NewsRelevance } from "@/lib/news";
import { normalizeSectorsForMatching, SECTOR_LABEL } from "@/lib/sectors";
import { sectorSlugForSic } from "@/lib/sic-sectors";

export const NEWS_COLUMNS = "id, title, url, source_name, published_at, tickers, sectors";

/** How many of the largest companies in a held sector may bring a story into "Matches your sectors". */
export const SECTOR_LEADERS_N = 10;

export interface NewsInterests {
  tracked: string[];
  /** Tagger slugs (news_items.sectors form) the user has stated on a holding. */
  sectorSlugs: string[];
  /**
   * Tickers allowed to bring a story into the sector tier: the SECTOR_LEADERS_N
   * largest companies (by market cap) in each sector the user holds. A story
   * about any other named company is not "your sector" just because a headline
   * word tagged it so - an 8-K/A for a tiny shell company, or a Tesla story
   * "matched on technology" (audit 2026-10-02, item 5.6). Absent = none.
   */
  leaders?: string[];
}

/** One company's sector slug (from its SIC code) and market cap, for choosing leaders. */
export interface SectorCompany {
  symbol: string;
  slug: string | null;
  marketCap: number | null;
}

/** The N largest companies in each stated sector, as one list. Pure. */
export function pickSectorLeaders(companies: readonly SectorCompany[], sectorSlugs: readonly string[], n = SECTOR_LEADERS_N): string[] {
  const out = new Set<string>();
  for (const slug of sectorSlugs) {
    companies
      .filter((c) => c.slug === slug && c.marketCap !== null && c.marketCap > 0)
      .sort((a, b) => (b.marketCap as number) - (a.marketCap as number) || a.symbol.localeCompare(b.symbol))
      .slice(0, n)
      .forEach((c) => out.add(c.symbol));
  }
  return [...out];
}

/** A regulatory filing rather than a news story: it names a company by law, not by interest. */
export function isFiling(a: { source_name?: string | null; title?: string | null }): boolean {
  return /\b(?:sec|edgar)\b/i.test(a.source_name ?? "") || /^(?:8-K|10-K|10-Q|S-1|424B|SC 13|Form\s)/i.test(a.title ?? "");
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
  return { tracked: [...tracked], sectorSlugs, leaders: sectorSlugs.length > 0 ? await readSectorLeaders(supabase, sectorSlugs) : [] };
}

/**
 * The largest companies in the user's sectors. Sector comes from the SIC code the
 * SEC filed (fundamentals.sic, mapped by lib/sic-sectors.ts), size from shares
 * outstanding x the latest stored close. Two reads, no per-symbol round trips.
 * A failed read means no leaders, so the sector tier narrows rather than widens.
 */
async function readSectorLeaders(supabase: SupabaseClient<Database>, sectorSlugs: string[]): Promise<string[]> {
  const { data: funds } = await supabase.from("fundamentals").select("symbol, sic, shares_outstanding");
  const inSectors = (funds ?? [])
    .map((f) => ({ symbol: f.symbol, slug: sectorSlugForSic(f.sic), shares: f.shares_outstanding }))
    .filter((f) => f.slug !== null && sectorSlugs.includes(f.slug as string) && f.shares);
  if (inSectors.length === 0) return [];
  const { data: bars } = await supabase.rpc("recent_prices", { symbols: inSectors.map((f) => f.symbol), per_symbol: 1 });
  const close = new Map<string, number>();
  for (const b of (bars ?? []) as { symbol: string; close: number | null }[]) if (b.close !== null) close.set(b.symbol, Number(b.close));
  return pickSectorLeaders(
    inSectors.map((f) => ({ symbol: f.symbol, slug: f.slug, marketCap: close.has(f.symbol) ? (close.get(f.symbol) as number) * Number(f.shares) : null })),
    sectorSlugs,
  );
}

/** "{A,B}" for a PostgREST array literal; symbols/slugs are quoted so a "." or "-" is safe. */
const arrayLiteral = (values: string[]) => `{${values.map((v) => `"${v.replace(/["\\]/g, "")}"`).join(",")}}`;

export function classifyNews(
  a: { tickers: string[] | null; sectors: string[] | null; source_name?: string | null; title?: string | null },
  interests: NewsInterests,
): { relevance: NewsRelevance; matchedOn: string[] } {
  const tracked = new Set(interests.tracked);
  const tickerMatches = (a.tickers ?? []).filter((t) => tracked.has(t));
  if (tickerMatches.length > 0) return { relevance: "holding", matchedOn: tickerMatches };
  const stated = new Set(interests.sectorSlugs);
  const sectorMatches = (a.sectors ?? []).filter((s) => [...normalizeSectorsForMatching([s])].some((n) => stated.has(n)));
  if (sectorMatches.length === 0) return { relevance: "general", matchedOn: [] };

  // A tag is not enough. A story that NAMES companies only counts as "your
  // sector" if one of them is a leader of that sector; a filing must have one,
  // since a filing names its company by law, not because it is of interest.
  const leaders = new Set(interests.leaders ?? []);
  const named = a.tickers ?? [];
  const leader = named.find((t) => leaders.has(t));
  const label = (raw: string) => {
    const slug = [...normalizeSectorsForMatching([raw])][0];
    return SECTOR_LABEL[slug] ?? raw;
  };
  if (leader) return { relevance: "sector", matchedOn: [`${leader}, a large ${label(sectorMatches[0])} company`] };
  if (named.length === 0 && !isFiling(a)) return { relevance: "sector", matchedOn: [`${label(sectorMatches[0])} sector news`] };
  return { relevance: "general", matchedOn: [] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyNewsFilter<Q extends { overlaps: any; not: any; or: any; contains: any; ilike: any; eq: any }>(query: Q, filter: NewsFilter, interests: NewsInterests, search: string, ticker?: string): Q | null {
  let q = query;
  if (filter === "holding") {
    if (interests.tracked.length === 0) return null;
    q = q.overlaps("tickers", interests.tracked);
  } else if (filter === "sector") {
    if (interests.sectorSlugs.length === 0) return null;
    // A story about a held ticker is "holding" tier, not "sector", however it is tagged.
    q = q.overlaps("sectors", interests.sectorSlugs);
    // Same rule as classifyNews: no named company, or a named leader of the sector.
    const leaders = interests.leaders ?? [];
    q = leaders.length > 0 ? q.or(`tickers.eq.{},tickers.ov.${arrayLiteral(leaders)}`) : q.eq("tickers", "{}");
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

