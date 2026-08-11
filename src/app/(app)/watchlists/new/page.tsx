import { NewWatchlistForm } from "@/components/watchlists/new-watchlist-form";

export default function NewWatchlistPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-serif text-xl text-primary">New watchlist</h2>
      <NewWatchlistForm />
    </div>
  );
}
