import { getNewsCounts, getNewsPage } from "@/lib/actions/news";
import { NewsPanel } from "@/components/news/news-panel";

// ?q= pre-fills the search (the ticker page links here as /news?q=NVDA).
export default async function NewsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80) ?? "";
  const [first, counts] = await Promise.all([getNewsPage({ search: q }), getNewsCounts(q)]);
  return <NewsPanel initialPage={first} initialCounts={counts} initialQuery={q} />;
}
