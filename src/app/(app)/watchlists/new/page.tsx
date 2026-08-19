import Link from "next/link";
import { NewWatchlistForm } from "@/components/watchlists/new-watchlist-form";

export default function NewWatchlistPage() {
  return (
    <div className="animate-page-in flex flex-col gap-4">
      <Link
        href="/watchlists"
        className="w-fit text-[12.5px] text-muted transition-colors duration-fast ease-standard hover:text-primary"
      >
        ← Watchlists
      </Link>

      <div>
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">New watchlist</div>
        <h1 className="font-serif text-[30px] leading-[1.1] font-normal text-primary">Mark a new trail</h1>
        <p className="mt-1.75 max-w-[560px] text-[13.5px] text-muted text-pretty">
          Name it and decide how it should behave. You can change any of this later.
        </p>
      </div>

      <NewWatchlistForm />
    </div>
  );
}
