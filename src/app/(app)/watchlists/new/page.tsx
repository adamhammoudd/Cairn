import Link from "next/link";
import { NewWatchlistForm } from "@/components/watchlists/new-watchlist-form";

export default function NewWatchlistPage() {
  return (
    <div className="animate-page-in flex flex-col gap-4">
      <Link
        href="/watchlists"
        className="w-fit text-body text-muted transition-colors duration-fast ease-standard hover:text-primary"
      >
        ← Watchlists
      </Link>

      <div>
        <div className="mb-2 font-mono text-eyebrow-page text-muted uppercase">New watchlist</div>
        <h1 className="font-serif text-h1 leading-[1.1] font-normal text-primary">Mark a new trail</h1>
        <p className="mt-2 max-w-[560px] text-lead text-muted text-pretty">
          Name it and decide how it should behave. You can change any of this later.
        </p>
      </div>

      <NewWatchlistForm />
    </div>
  );
}
