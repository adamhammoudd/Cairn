import Link from "next/link";
import { NewWatchlistForm } from "@/components/watchlists/new-watchlist-form";

export default function NewWatchlistPage() {
  return (
    <div className="animate-page-in mx-auto max-w-[940px]">
      <Link
        href="/watchlists"
        className="mb-4 inline-block rounded-lg border border-line px-3 py-1.75 text-[12px] text-muted transition-colors duration-base ease-standard hover:border-[#3A3A3A] hover:text-primary"
      >
        ← Watchlists
      </Link>

      <div className="mb-5.5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">New watchlist</div>
        <h1 className="font-serif text-[30px] leading-tight font-normal text-primary">Mark a new trail</h1>
        <p className="mt-1.5 max-w-[560px] text-[13.5px] text-muted text-pretty">
          Name it and decide how it should behave. You can change any of this later.
        </p>
      </div>

      <NewWatchlistForm />
    </div>
  );
}
