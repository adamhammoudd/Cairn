// Adapter registry: each maps one provider's native response shape to a
// common NormalizedItem[]. Re-weighting or disabling a provider needs no
// code change - only adding a genuinely new response shape does.

export interface NormalizedItem {
  external_id: string | null;
  title: string;
  body: string | null;
  url: string | null;
  source_name: string;
  published_at: string; // ISO 8601
}

export interface ProviderRow {
  id: string;
  name: string;
  endpoint: string;
  config: Record<string, unknown>;
}

type Adapter = (provider: ProviderRow) => Promise<NormalizedItem[]>;

async function fetchRss(provider: ProviderRow): Promise<NormalizedItem[]> {
  const res = await fetch(provider.endpoint, { headers: { "User-Agent": "cairn-ingest/1.0" } });
  if (!res.ok) throw new Error(`${provider.name}: HTTP ${res.status}`);
  const xml = await res.text();

  const items: NormalizedItem[] = [];
  const itemRe = /<item[\s\S]*?<\/item>/gi;
  const field = (block: string, tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
    if (!m) return null;
    return m[1]
      .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
      .replace(/<[^>]+>/g, "")
      .trim();
  };

  for (const match of xml.match(itemRe) ?? []) {
    const title = field(match, "title");
    if (!title) continue;
    const pubDate = field(match, "pubDate");
    items.push({
      external_id: field(match, "guid"),
      title,
      body: field(match, "description"),
      url: field(match, "link"),
      source_name: provider.name,
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

async function fetchNewsApiOrg(provider: ProviderRow): Promise<NormalizedItem[]> {
  const apiKey = String(provider.config.api_key ?? "");
  if (!apiKey) throw new Error(`${provider.name}: missing config.api_key`);

  const res = await fetch(provider.endpoint, { headers: { "X-Api-Key": apiKey } });
  if (!res.ok) throw new Error(`${provider.name}: HTTP ${res.status}`);
  const json = await res.json();

  return (json.articles ?? []).map((a: Record<string, string>) => ({
    external_id: a.url ?? null,
    title: a.title,
    body: a.description ?? a.content ?? null,
    url: a.url ?? null,
    source_name: a.source?.name ? `${provider.name} · ${a.source.name}` : provider.name,
    published_at: a.publishedAt ? new Date(a.publishedAt).toISOString() : new Date().toISOString(),
  }));
}

/** Default lookback for EDGAR full-text search, in days. Override per-provider
 *  with config.lookback_days. */
const EDGAR_DEFAULT_LOOKBACK_DAYS = 14;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, the format EDGAR expects
}

/**
 * SEC EDGAR full-text search.
 *
 * EDGAR's FTS endpoint ranks by RELEVANCE, not recency, and applies no date
 * bound of its own. Queried bare - as this provider was - it happily returns
 * filings from months back interleaved with today's, which then land in a feed
 * the product presents as current news. That silently degrades the "current"
 * promise of every other source in the feed.
 *
 * Two changes make it honest:
 *   1. A bounded date window is pushed into the query (dateRange=custom +
 *      startdt/enddt), so the server never considers stale filings at all.
 *   2. Results are re-sorted newest-first and anything outside the window is
 *      dropped locally, because relevance still governs the order *within* the
 *      window and a hit with a missing file_date would otherwise be silently
 *      stamped with "now".
 *
 * An endpoint that already carries its own startdt is left alone - that is an
 * operator deliberately overriding the default from the data_providers row.
 */
async function fetchSecEdgarFulltext(provider: ProviderRow): Promise<NormalizedItem[]> {
  const lookbackDays = Number(provider.config.lookback_days ?? EDGAR_DEFAULT_LOOKBACK_DAYS);
  const now = new Date();
  const windowStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const url = new URL(provider.endpoint);
  if (!url.searchParams.has("startdt")) {
    url.searchParams.set("dateRange", "custom");
    url.searchParams.set("startdt", isoDay(windowStart));
    url.searchParams.set("enddt", isoDay(now));
  }

  const res = await fetch(url.toString(), { headers: { "User-Agent": "cairn-ingest contact@example.com" } });
  if (!res.ok) throw new Error(`${provider.name}: HTTP ${res.status}`);
  const json = await res.json();

  const items: NormalizedItem[] = (json.hits?.hits ?? []).map((hit: { _id: string; _source: Record<string, unknown> }) => {
    const s = hit._source;
    const names = Array.isArray(s.display_names) ? (s.display_names as string[]).join(", ") : "";
    const adsh = String(s.adsh ?? "").replace(/-/g, "");
    const cik = Array.isArray(s.ciks) ? (s.ciks as string[])[0] : "";
    return {
      external_id: hit._id,
      title: `${s.form ?? "Filing"} - ${names || "SEC filer"}`,
      body: String(s.file_description ?? ""),
      url: cik && adsh ? `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh}` : null,
      source_name: "SEC EDGAR",
      // No fallback to "now". A filing with no file_date used to be stamped
      // with the ingest time, which is exactly how a stale filing became a
      // fresh-looking headline. Undated hits are dropped just below instead.
      published_at: s.file_date ? new Date(String(s.file_date)).toISOString() : "",
    };
  });

  const cutoff = windowStart.getTime();
  return items
    .filter((item) => {
      if (!item.published_at) return false;
      const t = Date.parse(item.published_at);
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

export const ADAPTERS: Record<string, Adapter> = {
  rss: fetchRss,
  newsapi_org: fetchNewsApiOrg,
  sec_edgar_fulltext: fetchSecEdgarFulltext,
};
