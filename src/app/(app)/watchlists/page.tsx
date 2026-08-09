import { listWatchlists } from "@/lib/actions/watchlists";
import { WatchlistPanel } from "@/components/watchlists/watchlist-panel";

export default async function WatchlistsPage() {
  const watchlists = await listWatchlists();
  return <WatchlistPanel watchlists={watchlists} />;
}
