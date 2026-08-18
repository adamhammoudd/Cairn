import Link from "next/link";
import { NewWatchlistForm } from "@/components/watchlists/new-watchlist-form";

export default function NewWatchlistPage() {
  return (
    <div>
      <Link
        href="/watchlists"

 >
        ← Watchlists
      </Link>

      <div>
        <div>New watchlist</div>
        <h1>Mark a new trail</h1>
        <p>
          Name it and decide how it should behave. You can change any of this later.
        </p>
      </div>

      <NewWatchlistForm />
    </div>
  );
}
