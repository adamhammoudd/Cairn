import { listWatchlists } from "@/lib/actions/watchlists";
import { WatchlistPanel } from "@/components/watchlists/watchlist-panel";
import { guardReads } from "@/components/data-unavailable";

// A failed market-data read renders the panel instead of throwing into a
// minified React error; anything else propagates as before.
export default async function WatchlistsPage() {
  return guardReads(WatchlistsBody);
}

async function WatchlistsBody() {
  const watchlists = await listWatchlists();
  return <WatchlistPanel watchlists={watchlists} />;
}
