import { getNewsFeed } from "@/lib/actions/news";
import { NewsPanel } from "@/components/news/news-panel";

export default async function NewsPage() {
  const items = await getNewsFeed();
  return <NewsPanel items={items} />;
}
