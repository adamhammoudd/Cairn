// News beyond 60 (feat/news-pagination).
//
// 1. Offline: a simulated table with heavy published_at ties (the live table
//    has ~1,000 tied groups) is paged with the real helpers - pageFromRows,
//    isAfterCursor, rankWithinPage - and every page is checked for duplicates,
//    gaps and in-page ranking.
// 2. Live, read-only (needs SUPABASE credentials in .env.local): the real query
//    builder (lib/news-query.ts) plus the real keyset filter walk the live
//    news_items table page by page, and the union is compared with one big
//    ordered read. Filters and search are checked the same way.
//
// Run: npx tsx --conditions=react-server scripts/tests/news-pagination.ts

import "./env";
import { pathToFileURL } from "node:url";
import {
  isAfterCursor,
  keysetOrFilter,
  NEWS_PAGE_SIZE,
  pageFromRows,
  parseNewsSearch,
  rankWithinPage,
  type NewsCursor,
  type NewsFeedItem,
  type NewsRelevance,
} from "@/lib/news";
import { applyNewsFilter, classifyNews, NEWS_COLUMNS, type NewsInterests } from "@/lib/news-query";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const order = (a: { published_at: string; id: string }, b: { published_at: string; id: string }) => {
  const d = Date.parse(b.published_at) - Date.parse(a.published_at);
  return d !== 0 ? d : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
};

/** 157 rows over 23 timestamps: most rows are tied with several others. */
function simulatedTable(): NewsFeedItem[] {
  const rows: NewsFeedItem[] = [];
  const tiers: NewsRelevance[] = ["general", "holding", "general", "sector", "general"];
  for (let n = 0; n < 157; n++) {
    const hex = (n * 2654435761 >>> 0).toString(16).padStart(8, "0");
    rows.push({
      id: `${hex}-0000-4000-8000-${String(n).padStart(12, "0")}`,
      title: `Story ${n}`,
      url: null,
      source_name: "Test",
      published_at: new Date(Date.UTC(2026, 8, 27, 12) - (n % 23) * 3_600_000).toISOString(),
      tickers: [],
      sectors: [],
      relevance: tiers[n % tiers.length],
      matchedOn: [],
    });
  }
  return rows;
}

function walk<T extends { published_at: string; id: string }>(fetchPage: (cursor: NewsCursor | null) => T[], limit: number) {
  const pages: T[][] = [];
  let cursor: NewsCursor | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    const { rows, nextCursor }: { rows: T[]; nextCursor: NewsCursor | null } = pageFromRows(fetchPage(cursor), limit);
    pages.push(rows);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return pages;
}

async function liveCases(cases: TestCase[]) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    cases.push({ name: "live walk of news_items", status: "skip", detail: "no Supabase credentials in the environment" });
    return;
  }
  const db = createAdminClient();
  const interests: NewsInterests = { tracked: ["NVDA", "AAPL", "MSFT"], sectorSlugs: ["semiconductors", "crypto"] };
  const PAGES = 6;

  async function livePages(filter: "all" | "holding" | "sector" | "general", search = "") {
    const out: { id: string; published_at: string; tickers: string[] | null; sectors: string[] | null; title: string }[][] = [];
    let cursor: NewsCursor | null = null;
    for (let p = 0; p < PAGES; p++) {
      let q = db.from("news_items").select(NEWS_COLUMNS);
      if (cursor) q = q.or(keysetOrFilter(cursor));
      const f = applyNewsFilter(q, filter, interests, search);
      if (!f) break;
      const { data, error } = await f.order("published_at", { ascending: false }).order("id", { ascending: false }).limit(NEWS_PAGE_SIZE + 1);
      if (error) throw new Error(error.message);
      const { rows, nextCursor } = pageFromRows(data ?? [], NEWS_PAGE_SIZE);
      out.push(rows);
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    return out;
  }

  // All: 6 pages equal the first 240 rows of one ordered read, in order.
  const pages = await livePages("all");
  const walked = pages.flat();
  const { data: reference, error } = await db.from("news_items").select("id, published_at").order("published_at", { ascending: false }).order("id", { ascending: false }).limit(walked.length);
  if (error) throw new Error(error.message);
  cases.push(check(`live: ${pages.length} pages of ${NEWS_PAGE_SIZE} walked`, pages.length === PAGES && pages.every((p) => p.length === NEWS_PAGE_SIZE), pages.map((p) => p.length).join(",")));
  cases.push(check("live: no duplicates across pages", new Set(walked.map((r) => r.id)).size === walked.length, `${walked.length} rows`));
  cases.push(check("live: no gaps - the walk equals one ordered read of the same length, row for row", walked.map((r) => r.id).join() === (reference ?? []).map((r) => r.id).join(), `${walked.length} vs ${(reference ?? []).length}`));
  const ties = walked.length - new Set(walked.map((r) => r.published_at)).size;
  cases.push(check("live: the walk crossed tied timestamps (so the id tie-break was exercised)", ties > 0, `${ties} tied rows`));
  cases.push(check("live: the feed now reaches past row 60", walked.length > 60, String(walked.length)));

  // Filters: every row on every page satisfies the filter; classify agrees.
  for (const filter of ["holding", "sector", "general"] as const) {
    const fp = (await livePages(filter)).flat();
    const tiers = new Set(fp.map((r) => classifyNews(r, interests).relevance));
    cases.push(check(`live: "${filter}" filter returns only ${filter} stories, no duplicates`, fp.length > 0 && tiers.size === 1 && tiers.has(filter) && new Set(fp.map((r) => r.id)).size === fp.length, `${fp.length} rows, tiers ${[...tiers].join(",")}`));
  }

  // Search: ticker and keyword.
  const nv = (await livePages("all", "NVDA")).flat();
  cases.push(check("live: search 'NVDA' returns stories tagged NVDA or naming it, past one page", nv.length > NEWS_PAGE_SIZE && nv.every((r) => (r.tickers ?? []).includes("NVDA") || /nvda/i.test(r.title)), `${nv.length} rows`));
  const kw = (await livePages("all", "interest rates")).flat();
  cases.push(check("live: keyword search matches titles", kw.length > 0 && kw.every((r) => /interest rates/i.test(r.title)), `${kw.length} rows`));
}

export async function runNewsPaginationSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];

  // ---- offline -------------------------------------------------------------------
  const table = simulatedTable().sort(order);
  const pages = walk((cursor) => table.filter((r) => isAfterCursor(r, cursor)).slice(0, NEWS_PAGE_SIZE + 1), NEWS_PAGE_SIZE);
  const seen = pages.flat();
  cases.push(check("offline: 157 rows -> pages of 40,40,40,37", pages.map((p) => p.length).join(",") === "40,40,40,37", pages.map((p) => p.length).join(",")));
  cases.push(check("offline: no duplicates across pages despite heavy ties", new Set(seen.map((r) => r.id)).size === seen.length, `${seen.length} rows`));
  cases.push(check("offline: no gaps - every row is on exactly one page", seen.length === table.length && table.every((r) => seen.some((s) => s.id === r.id)), `${seen.length}/${table.length}`));
  const ranked = pages.map((p) => rankWithinPage(p));
  const rankOk = ranked.every((p) => {
    const r = p.map((x) => ({ holding: 0, sector: 1, general: 2 })[x.relevance]);
    return r.every((v, k) => k === 0 || v >= r[k - 1]);
  });
  cases.push(check("offline: each page is ranked holdings -> sectors -> rest", rankOk, ranked.map((p) => p.map((x) => x.relevance[0]).join("")).join(" | ")));
  const reranked = walk((cursor) => table.filter((r) => isAfterCursor(r, cursor)).slice(0, NEWS_PAGE_SIZE + 1), NEWS_PAGE_SIZE).map((p) => rankWithinPage(p)).flat();
  cases.push(check("offline: ranking inside a page never moves a row to another page", reranked.length === table.length && new Set(reranked.map((r) => r.id)).size === table.length, `${reranked.length}`));
  const single = walk((cursor) => table.slice(0, 5).filter((r) => isAfterCursor(r, cursor)).slice(0, NEWS_PAGE_SIZE + 1), NEWS_PAGE_SIZE);
  cases.push(check("offline: a short feed is one page with no next cursor", single.length === 1 && single[0].length === 5, `${single.length} page(s)`));
  const exact = walk((cursor) => table.slice(0, 80).filter((r) => isAfterCursor(r, cursor)).slice(0, NEWS_PAGE_SIZE + 1), NEWS_PAGE_SIZE);
  cases.push(check("offline: exactly 2 full pages -> no empty third page", exact.length === 2 && exact.every((p) => p.length === 40), exact.map((p) => p.length).join(",")));

  // ---- the filter string ------------------------------------------------------------
  const f = keysetOrFilter({ publishedAt: "2026-09-27T12:00:00+00:00", id: "0a1b2c3d-0000-4000-8000-000000000001" });
  cases.push(check("keyset filter: strictly-after in (published_at, id) order, timestamp passed through", f === 'published_at.lt."2026-09-27T12:00:00+00:00",and(published_at.eq."2026-09-27T12:00:00+00:00",id.lt.0a1b2c3d-0000-4000-8000-000000000001)', f));
  let injected = false;
  try {
    keysetOrFilter({ publishedAt: "2026-09-27T12:00:00Z,title.ilike.*", id: "0a1b2c3d-0000-4000-8000-000000000001" });
  } catch {
    injected = true;
  }
  cases.push(check("keyset filter: a tampered cursor is refused, not spliced into the query", injected, "throws"));
  let badId = false;
  try {
    keysetOrFilter({ publishedAt: "2026-09-27T12:00:00Z", id: "x),or(id.gt.0" });
  } catch {
    badId = true;
  }
  cases.push(check("keyset filter: a non-uuid id is refused", badId, "throws"));

  // ---- search parsing ------------------------------------------------------------------
  const s1 = parseNewsSearch("$nvda");
  cases.push(check("search: $nvda -> ticker NVDA (and the word, for titles)", s1.ticker === "NVDA" && s1.keyword === "nvda", JSON.stringify(s1)));
  const s2 = parseNewsSearch("tesla");
  cases.push(check("search: 'tesla' -> ticker-shaped word also searched in titles", s2.keyword === "tesla", JSON.stringify(s2)));
  const s3 = parseNewsSearch("interest rates");
  cases.push(check("search: two words -> title keyword only", s3.ticker === null && s3.keyword === "interest rates", JSON.stringify(s3)));
  const s4 = parseNewsSearch("50%_off),or(id.gt.0");
  cases.push(check("search: %, _, commas and parentheses are stripped", !/[%_(),]/.test(`${s4.keyword}`), JSON.stringify(s4)));
  cases.push(check("search: BRK.B is a ticker", parseNewsSearch("BRK.B").ticker === "BRK.B", JSON.stringify(parseNewsSearch("BRK.B"))));
  cases.push(check("search: empty -> no filter", parseNewsSearch("  ").ticker === null && parseNewsSearch("  ").keyword === null, "null"));

  // ---- live, read-only ---------------------------------------------------------------------
  try {
    await liveCases(cases);
  } catch (err) {
    cases.push({ name: "live walk of news_items", status: "fail", detail: err instanceof Error ? err.message : String(err) });
  }

  return { suiteName: "News pagination (keyset, no duplicates or gaps; filters and search in the database)", gating: true, cases };
}

async function main() {
  const suite = await runNewsPaginationSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status.toUpperCase().padEnd(5)} ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
