// Free-tier news provider for the ingestion layer. Fetch client only -- does
// not write to Supabase. news_items already has a data_providers table with
// provider_type 'news' seeded, so this is the fetch-side counterpart to that
// existing ingestion design, gated behind an env var so the app runs fine
// on seeded/existing news_items data with no key configured.
//
// Provider: GNews (gnews.io) free tier -- 100 requests/day, general +
// business/market category search, simpler single-key setup than stitching
// multiple sources. LEGAL: flagged for cfo-legal-advisor ToS review before
// scheduling any production ingestion job -- GNews's free tier in particular
// has redistribution/caching limits worth a specific look. Not wired into a
// cron/edge function yet.

export interface NewsSearchResult {
  externalId: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string;
}

const GNEWS_BASE = "https://gnews.io/api/v4";

export function isNewsProviderConfigured(): boolean {
  return Boolean(process.env.GNEWS_API_KEY);
}

export async function searchMarketNews(query: string): Promise<NewsSearchResult[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];

  const url = `${GNEWS_BASE}/search?q=${encodeURIComponent(query)}&lang=en&topic=business&apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return [];

  // res.json() is typed `unknown` by the current fetch typings; the payload is
  // third-party, so the shape is still checked before use.
  const data = (await res.json()) as Record<string, unknown>;
  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles.map((a: { url: string; title: string; source?: { name?: string }; publishedAt: string }) => ({
    externalId: a.url,
    title: a.title,
    url: a.url,
    sourceName: a.source?.name ?? "GNews",
    publishedAt: a.publishedAt,
  }));
}
