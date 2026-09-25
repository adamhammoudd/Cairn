"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addWatchlistItem } from "@/lib/actions/watchlists";

interface WatchButtonProps {
  symbol: string;
  /** The user's lists, so the picker can add without a round trip to /watchlists. */
  watchlists: { id: string; name: string; hasSymbol: boolean }[];
}

export function WatchButton({ symbol, watchlists }: WatchButtonProps) {
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState(addWatchlistItem, null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onAway(e: Event) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onAway);
    document.addEventListener("touchstart", onAway);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("touchstart", onAway);
    };
  }, []);

  const watching = watchlists.some((w) => w.hasSymbol) || result === "saved";
  // A successful add closes the picker without an effect: the saved result is
  // itself the signal, so there is no second render pass to chase.
  const menuOpen = open && result !== "saved";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-panel border px-3.5 py-2.5 text-body transition-colors duration-base ease-standard hover:border-line-strong ${
          watching ? "border-accent text-accent" : "border-line text-primary"
        }`}
      >
        {watching ? "★ Watching" : "☆ Watch"}
      </button>

      {menuOpen && (
        <div className="animate-menu-in absolute top-[calc(100%+8px)] right-0 z-30 min-w-52 rounded-panel border border-line bg-panel p-1.5 shadow-2xl">
          {watchlists.length === 0 ? (
            <Link
              href="/watchlists/new"
              className="block rounded-control px-2.5 py-2 text-body text-muted hover:bg-active hover:text-primary"
            >
              Create a watchlist first
            </Link>
          ) : (
            watchlists.map((w) => (
              <form key={w.id} action={formAction}>
                <input type="hidden" name="watchlist_id" value={w.id} />
                <input type="hidden" name="symbol" value={symbol} />
                <button
                  type="submit"
                  disabled={w.hasSymbol}
                  className="flex w-full items-center justify-between gap-3 rounded-control px-2.5 py-2 text-left text-body text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary disabled:cursor-default disabled:text-dim disabled:hover:bg-transparent"
                >
                  {w.name}
                  {w.hasSymbol && <span className="font-mono text-eyebrow text-accent uppercase">on</span>}
                </button>
              </form>
            ))
          )}
          {result && result !== "saved" && <div className="px-2.5 py-1.5 text-caption text-warning">{result}</div>}
        </div>
      )}
    </div>
  );
}
