"use client";

import { useState } from "react";
import Link from "next/link";
import { decodeEntities, type NewsFeedItem, type NewsRelevance } from "@/lib/news";

const RELEVANCE_LABEL: Record<NewsRelevance, string> = {
  holding: "In your portfolio",
  sector: "Matches your sectors",
  general: "Market-wide",
};

// Relevance ladder, accent -> secondary -> macro. Violet stays reserved for
// crypto asset-type tags elsewhere, so the middle tier keeps the info blue it
// already used. The rail down the card and the badge both read from here.
const RELEVANCE_BAR: Record<NewsRelevance, string> = {
  holding: "bg-accent",
  sector: "bg-info",
  general: "bg-warning",
};

/** Badge fill/border per tier, matching the rail that runs down the card. */
const RELEVANCE_BADGE: Record<NewsRelevance, string> = {
  holding: "border-accent/35 bg-accent/10 text-accent",
  sector: "border-info/35 bg-info/10 text-info",
  general: "border-warning/35 bg-warning/10 text-warning",
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

  // Counts per tier, for the filter chips and the coverage mix. Derived from
  // the whole feed, not the filtered view - a chip that only counted what is
  // already on screen would always read as the number you can see.
  const counts: Record<NewsRelevance, number> = { holding: 0, sector: 0, general: 0 };
  for (const item of items) counts[item.relevance] += 1;
  const maxCount = Math.max(counts.holding, counts.sector, counts.general, 1);
  const lead = visible[0];

  return (
    <div className="animate-page-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-[18px]">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">News</div>
          <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
            Ranked for you
          </h1>
          <p className="mt-2 max-w-[540px] text-[13.5px] leading-[1.55] text-muted text-pretty">
            Items touching your holdings surface first, then your sectors, then macro. Every item carries its source
            and age.
          </p>
        </div>
        <span className="flex items-center gap-[7px] rounded-[9px] border border-line px-3 py-2 text-[12.5px] text-muted">
          <span aria-hidden className="animate-breathe h-1.5 w-1.5 rounded-full bg-accent" />
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Lead story. The top of a ranked feed is the page's actual answer to
          "what happened", so it gets read at headline size rather than as the
          first of seven identical rows. No standfirst is rendered: the feed
          stores a title and a source, and writing a summary Cairn never
          received would be inventing coverage. */}
      {lead && (
        <section
          className="animate-rise-in relative overflow-hidden rounded-2xl border border-[#232323] px-6 py-[22px]"
          style={{ background: "linear-gradient(180deg,#111010,#0d0d0d)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              inset: "-60% 58% 45% -12%",
              background: "radial-gradient(closest-side, rgba(217,164,65,.18), transparent)",
              animation: "cn-glow 7s ease-in-out infinite",
            }}
          />
          <div className="relative flex flex-wrap gap-6">
            <div className="min-w-0 flex-[2_1_380px]">
              <div className="flex items-center gap-2.5 font-mono text-eyebrow tracking-[0.18em] text-warning uppercase">
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full bg-warning shadow-[0_0_0_4px_rgba(217,164,65,0.14)]"
                />
                <span suppressHydrationWarning>Lead story &middot; {relativeTime(lead.published_at)}</span>
              </div>
              {lead.url ? (
                <a
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3.5 block font-serif text-[30px] leading-[1.24] font-normal tracking-[-0.01em] text-primary text-pretty transition-colors duration-fast ease-standard hover:text-accent"
                >
                  {decodeEntities(lead.title)}
                </a>
              ) : (
                <h2 className="mt-3.5 font-serif text-[30px] leading-[1.24] font-normal tracking-[-0.01em] text-primary text-pretty">
                  {decodeEntities(lead.title)}
                </h2>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {lead.tickers.slice(0, 4).map((t) => (
                  <Link
                    key={t}
                    href={`/ticker/${t}`}
                    className="rounded-full border border-violet/30 bg-violet/10 px-2.5 py-[5px] font-mono text-eyebrow tracking-[0.1em] text-violet transition-colors duration-fast ease-standard hover:border-violet"
                  >
                    {t}
                  </Link>
                ))}
                <span className="rounded-full border border-line px-2.5 py-[5px] text-[11.5px] text-muted">
                  {lead.source_name}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-[1_1_250px] flex-col gap-2.5">
              <div className="font-mono text-eyebrow tracking-[0.16em] text-dim uppercase">Coverage mix today</div>
              {(["holding", "sector", "general"] as NewsRelevance[]).map((tier, i) => (
                <div key={tier} className="grid grid-cols-[92px_minmax(0,1fr)_34px] items-center gap-2.5 text-caption">
                  <span className="text-muted">{RELEVANCE_LABEL[tier]}</span>
                  <span aria-hidden className="h-1.5 overflow-hidden rounded-xs bg-[#1a1a1a]">
                    <span
                      className={`block h-full rounded-xs opacity-80 ${RELEVANCE_BAR[tier]}`}
                      style={{
                        width: `${(counts[tier] / maxCount) * 100}%`,
                        animation: `cn-fade 500ms ease ${200 + i * 80}ms both`,
                      }}
                    />
                  </span>
                  <span className="text-right font-mono text-muted tabular-nums">{counts[tier]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mt-3.5 mb-3 flex w-fit flex-wrap gap-[3px] rounded-[11px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          const tierCount = f.id === "all" ? items.length : counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-[7px] rounded-[9px] px-[13px] py-[7px] text-[12.5px] whitespace-nowrap transition-colors duration-base ease-standard ${
                active ? "bg-[#1e1e1e] text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {f.label}
              <span
                className={`rounded-[5px] px-[5px] py-px font-mono text-eyebrow ${
                  active ? "bg-accent/15 text-accent-light" : "bg-[#161616] text-dim"
                }`}
              >
                {tierCount}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {visible.map((item, index) => (
          <article
            key={item.id}
            className="animate-rise-in flex gap-[15px] overflow-hidden rounded-[14px] border border-[#232323] bg-panel transition-[border-color,transform,background] duration-base ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:bg-[#121212]"
            style={{ animationDelay: `${120 + Math.min(index, 8) * 55}ms` }}
          >
            <span className={`w-[3px] shrink-0 self-stretch ${RELEVANCE_BAR[item.relevance]}`} />
            <div className="min-w-0 flex-1 py-[15px] pr-[18px]">
              <div className="mb-2 flex flex-wrap items-center gap-2.5 text-[11.5px] text-dim">
                <span
                  className={`rounded-full border px-[9px] py-[3px] font-mono text-[9.5px] tracking-[0.12em] uppercase ${RELEVANCE_BADGE[item.relevance]}`}
                >
                  {RELEVANCE_LABEL[item.relevance]}
                </span>
                <span suppressHydrationWarning>
                  {item.source_name} <span className="text-line-strong">&middot;</span> {relativeTime(item.published_at)}
                </span>
              </div>

              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-serif text-[20px] leading-[1.32] tracking-[-0.005em] text-primary text-pretty transition-colors duration-fast ease-standard hover:text-accent"
                >
                  {decodeEntities(item.title)}
                </a>
              ) : (
                <div className="font-serif text-[20px] leading-[1.32] tracking-[-0.005em] text-primary text-pretty">{decodeEntities(item.title)}</div>
              )}

              {item.matchedOn.length > 0 && (
                <div className="mt-2 text-[12.5px] text-muted">Matched on {item.matchedOn.join(", ")}</div>
              )}

              {item.tickers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.tickers.map((ticker) => (
                    <Link
                      key={ticker}
                      href={`/ticker/${ticker}`}
                      className="rounded-full border border-line bg-[#121212] px-2.5 py-[3px] font-mono text-eyebrow tracking-[0.1em] text-muted transition-colors duration-base ease-standard hover:border-accent hover:text-primary"
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
