"use client";

import { useState, useTransition } from "react";
import { decodeEntities, type NewsCursor } from "@/lib/news";
import { getNewsPage } from "@/lib/actions/news";

interface Item {
  id: string;
  title: string;
  source_name: string;
  url: string | null;
  published_at: string;
}

/** Stories shown before "Load more", and fetched per click after that. */
const FIRST = 8;
const MORE = 20;

// The ticker page's news list. It showed the newest 8 stories and stopped;
// "Load more" now pages back through every stored story tagged with this
// ticker, using the same keyset cursor as the News page (lib/news.ts).
export function TickerNewsList({ symbol, initial }: { symbol: string; initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial.slice(0, FIRST));
  const last = items[items.length - 1];
  const [cursor, setCursor] = useState<NewsCursor | null>(
    initial.length > FIRST && last ? { publishedAt: last.published_at, id: last.id } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();

  function loadMore() {
    if (!cursor) return;
    start(async () => {
      try {
        const page = await getNewsPage({ ticker: symbol, cursor, limit: MORE });
        // Newest first within a ticker's list: relevance tiers mean nothing on
        // a page that is all about one ticker.
        const next = [...page.items].sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : a.id < b.id ? 1 : -1));
        setItems((prev) => [...prev, ...next]);
        setCursor(page.nextCursor);
        setError(null);
      } catch {
        setError("More news could not be loaded. Try again in a moment.");
      }
    });
  }

  if (items.length === 0) return <p className="px-4 py-4 text-body text-dim">No recent news ingested for {symbol}.</p>;

  return (
    <>
      {items.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-3 border-b border-line-soft px-4 py-3.5 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
        >
          {/* The mock colours this rail by story sentiment. Nothing in the
              pipeline scores sentiment (news_items has the column; no ingest
              writes it), so it stays neutral rather than being coloured from
              a guess. */}
          <span aria-hidden className="w-[3px] shrink-0 self-stretch rounded-xs bg-line" />
          <div className="min-w-0">
            {n.url ? (
              <a href={n.url} target="_blank" rel="noreferrer" className="tap block text-body leading-[1.5] text-primary text-pretty hover:text-accent">
                {decodeEntities(n.title)}
              </a>
            ) : (
              <span className="block text-body leading-[1.5] text-primary text-pretty">{decodeEntities(n.title)}</span>
            )}
            <div className="mt-1.5 font-mono text-micro text-dim" suppressHydrationWarning>
              {n.source_name} · {new Date(n.published_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      ))}
      {(cursor || error) && (
        <div className="flex flex-col items-center gap-2 px-4 py-3">
          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="rounded-control border border-line px-3.5 py-1.5 text-caption text-primary transition-colors duration-fast ease-standard hover:border-accent disabled:opacity-60 pointer-coarse:min-h-11"
            >
              {loading ? "Loading…" : `More ${symbol} news`}
            </button>
          )}
          {error && (
            <p role="alert" className="text-caption text-warning">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
