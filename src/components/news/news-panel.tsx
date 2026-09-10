"use client";

import { useState } from "react";
import Link from "next/link";
import { decodeEntities, type NewsFeedItem, type NewsRelevance } from "@/lib/news";

const RELEVANCE_LABEL: Record<NewsRelevance, string> = {
  holding: "In your portfolio",
  sector: "Matches your sectors",
  general: "Market-wide",
};

// Relevance ladder, mirroring the mock's accent -> secondary -> macro tint
// order. Violet stays reserved for crypto asset-type tags elsewhere, so the
// middle tier keeps the info blue it already used.
const RELEVANCE_TEXT: Record<NewsRelevance, string> = {
  holding: "text-accent",
  sector: "text-info",
  general: "text-warning",
};

const RELEVANCE_BAR: Record<NewsRelevance, string> = {
  holding: "bg-accent",
  sector: "bg-info",
  general: "bg-warning",
};

const FILTERS: { id: "all" | NewsRelevance; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "holding", label: "Your holdings" },
  { id: "sector", label: "Your sectors" },
  { id: "general", label: "Macro" },
];

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NewsPanel({ items }: { items: NewsFeedItem[] }) {
  const [filter, setFilter] = useState<"all" | NewsRelevance>("all");

  const visible = filter === "all" ? items : items.filter((item) => item.relevance === filter);
  const filterLabel = filter === "all" ? "your feed" : (FILTERS.find((f) => f.id === filter)?.label ?? "").toLowerCase();

  return (
    <div className="animate-page-in">
      <div className="mb-4.5">
        <div className="mb-2 font-mono text-micro tracking-[0.16em] text-muted uppercase">News</div>
        <h1 className="font-serif text-display leading-[1.1] font-normal text-primary">Ranked for you</h1>
        <p className="mt-2 max-w-[580px] text-lead text-muted text-pretty">
          Items touching your holdings surface first, then your sectors, then macro. Every item carries its source and
          age.
        </p>
      </div>

      <div className="mb-4 flex w-fit flex-wrap gap-1.5 rounded-panel border border-line bg-panel p-1">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-control px-3 py-2 text-body transition-colors duration-base ease-standard ${
                active ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {visible.map((item, index) => (
          <article
            key={item.id}
            className="animate-rise-in flex gap-3.5 rounded-panel border border-line bg-panel px-4.5 py-4 transition-[border-color,transform] duration-base ease-standard hover:-translate-y-px hover:border-line-strong"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <span className={`w-1 shrink-0 rounded-full ${RELEVANCE_BAR[item.relevance]}`} />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2.5">
                <span
                  className={`font-mono text-eyebrow uppercase ${RELEVANCE_TEXT[item.relevance]}`}
                >
                  {RELEVANCE_LABEL[item.relevance]}
                </span>
                <span className="text-caption text-dim" suppressHydrationWarning>
                  {item.source_name} · {relativeTime(item.published_at)}
                </span>
              </div>

              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-serif text-h3 leading-snug text-primary text-pretty transition-colors duration-fast ease-standard hover:text-accent"
                >
                  {decodeEntities(item.title)}
                </a>
              ) : (
                <div className="font-serif text-h3 leading-snug text-primary text-pretty">{decodeEntities(item.title)}</div>
              )}

              {item.matchedOn.length > 0 && (
                <div className="mt-2 text-caption text-muted">Matched on {item.matchedOn.join(", ")}</div>
              )}

              {item.tickers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.tickers.map((ticker) => (
                    <Link
                      key={ticker}
                      href={`/ticker/${ticker}`}
                      className="rounded-full border border-line px-2.5 py-1 font-mono text-micro text-muted transition-colors duration-base ease-standard hover:border-accent hover:text-primary"
                    >
                      {ticker}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}

        {visible.length === 0 && (
          <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
            <div className="mb-4.5 flex h-10.5 items-end justify-center gap-1">
              <span className="h-2 w-8.5 rounded-full bg-active" />
              <span className="h-2 w-6.5 rounded-full bg-active" />
              <span className="h-2 w-4.5 rounded-full bg-line" />
            </div>
            <div className="font-serif text-h3 text-primary">Nothing filed under {filterLabel} yet</div>
            <p className="mx-auto mt-2 mb-4.5 max-w-[400px] text-body text-muted text-pretty">
              We only surface items we can attribute to a source. Check back, or widen the feed.
            </p>
            {filter !== "all" && (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_22px_rgba(47,198,133,0.35)]"
              >
                Show everything
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
