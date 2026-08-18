"use client";

import { useState } from "react";
import Link from "next/link";
import type { NewsFeedItem, NewsRelevance } from "@/lib/news";

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
    <div>
      <div>
        <div>News</div>
        <h1>Ranked for you</h1>
        <p>
          Items touching your holdings surface first, then your sectors, then macro. Every item carries its source and
          age.
        </p>
      </div>

      <div>
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}

 >
              {f.label}
            </button>
          );
        })}
      </div>

      <div>
        {visible.map((item, index) => (
          <article
            key={item.id}

 >
            <span />
            <div>
              <div>
                <span

 >
                  {RELEVANCE_LABEL[item.relevance]}
                </span>
                <span suppressHydrationWarning>
                  {item.source_name} · {relativeTime(item.published_at)}
                </span>
              </div>

              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"

 >
                  {item.title}
                </a>
              ) : (
                <div>{item.title}</div>
              )}

              {item.matchedOn.length > 0 && (
                <div>Matched on {item.matchedOn.join(", ")}</div>
              )}

              {item.tickers.length > 0 && (
                <div>
                  {item.tickers.map((ticker) => (
                    <Link
                      key={ticker}
                      href={`/ticker/${ticker}`}

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
          <div>
            <div>
              <span />
              <span />
              <span />
            </div>
            <div>Nothing filed under {filterLabel} yet</div>
            <p>
              We only surface items we can attribute to a source. Check back, or widen the feed.
            </p>
            {filter !== "all" && (
              <button
                type="button"
                onClick={() => setFilter("all")}

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
