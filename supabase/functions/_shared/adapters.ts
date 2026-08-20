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

async function fetchSecEdgarFulltext(provider: ProviderRow): Promise<NormalizedItem[]> {
  const res = await fetch(provider.endpoint, { headers: { "User-Agent": "cairn-ingest contact@example.com" } });
  if (!res.ok) throw new Error(`${provider.name}: HTTP ${res.status}`);
  const json = await res.json();

  return (json.hits?.hits ?? []).map((hit: { _id: string; _source: Record<string, unknown> }) => {
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
      published_at: s.file_date ? new Date(String(s.file_date)).toISOString() : new Date().toISOString(),
    };
  });
}

export const ADAPTERS: Record<string, Adapter> = {
  rss: fetchRss,
  newsapi_org: fetchNewsApiOrg,
  sec_edgar_fulltext: fetchSecEdgarFulltext,
};
