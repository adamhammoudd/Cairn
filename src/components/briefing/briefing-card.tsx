"use client";

import { useTransition } from "react";
import Link from "next/link";
import { requestBriefing } from "@/lib/actions/briefing";
import type { BriefingContent } from "@/lib/ai/briefing";
import { Disclosure } from "@/components/compliance/disclosure";
import { decodeEntities } from "@/lib/news";

interface BriefingCardProps {
  briefing: BriefingContent | null;
}

// The AI Assistant artboard's briefing card: gradient panel, accent glow, a
// mono date label + serif headline, the summary paragraph, then a compact row
// of highlight tiles. The full methodology cards it used to trail with are
// gone - the summary already names each analysis, and the one place a
// methodology card belongs on this page is under the answer that cites it.
export function BriefingCard({ briefing }: BriefingCardProps) {
  const [pending, startTransition] = useTransition();

  const today = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-card border border-line bg-gradient-to-b from-[#121212] to-panel p-5">
        {/* Soft accent bloom, purely atmospheric - sits behind the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(420px 140px at 12% 0%, rgba(47,198,133,0.10), transparent 70%)",
          }}
        />

        <div className="relative flex flex-wrap items-baseline justify-between gap-2.5">
          <div>
            <div className="font-mono text-[10px] tracking-[0.16em] text-accent uppercase">
              Daily briefing · {today}
            </div>
            <h2 className="mt-2 font-serif text-[24px] leading-tight font-normal text-primary">
              {briefing ? "What moved, and what's next" : "No briefing yet today"}
            </h2>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => requestBriefing())}
            className="rounded-lg border border-line bg-canvas/60 px-3 py-1.75 text-[12px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A] disabled:opacity-50"
          >
            {pending ? "Generating…" : briefing ? "Refresh" : "Generate"}
          </button>
        </div>

        {!briefing ? (
          <p className="relative mt-3 text-[13px] text-muted text-pretty">
            Generate one above and Cairn summarises the day across your holdings and watchlist - with sources on
            every claim.
          </p>
        ) : (
          <>
            <p className="relative mt-3.5 max-w-[760px] text-[13.5px] leading-relaxed text-primary text-pretty">
              {briefing.summary}
            </p>

            {(briefing.price_moves ?? []).length > 0 && (
              <div className="relative mt-4 flex flex-col gap-2">
                <div className="font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
                  Notable moves · last session
                </div>
                <div className="flex flex-wrap gap-2">
                  {briefing.price_moves.slice(0, 6).map((m) => {
                    const up = m.change_pct >= 0;
                    return (
                      <a
                        key={m.symbol}
                        href={`/ticker/${encodeURIComponent(m.symbol)}`}
                        className="rounded-lg border border-line bg-canvas/55 px-2.5 py-1.5 text-[12px] hover:border-[#3A3A3A]"
                      >
                        <span className="text-primary">{m.symbol}</span>{" "}
                        <span className={up ? "text-accent" : "text-negative"}>
                          {up ? "+" : ""}
                          {m.change_pct}%
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {(briefing.symbol_news ?? []).length > 0 && (
              <div className="relative mt-4 flex flex-col gap-2">
                <div className="font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
                  On your holdings &amp; watchlist
                </div>
                {briefing.symbol_news.slice(0, 4).map((n) => (
                  <div key={n.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {n.tickers[0] && (
                      <span className="font-mono text-[10px] text-accent">{n.tickers.join(" ")}</span>
                    )}
                    <span className="text-[12.5px] leading-snug text-primary text-pretty">
                      {decodeEntities(n.title)}
                    </span>
                    <span className="font-mono text-[10px] text-dim">{n.source_name}</span>
                  </div>
                ))}
              </div>
            )}

            {(briefing.news ?? []).length > 0 && (
              <div className="relative mt-4 flex flex-col gap-2">
                <div className="font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
                  In your news categories
                </div>
                {briefing.news.slice(0, 3).map((n) => (
                  <div key={n.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[12.5px] leading-snug text-primary text-pretty">
                      {decodeEntities(n.title)}
                    </span>
                    <span className="font-mono text-[10px] text-dim">{n.source_name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Older briefings were generated before Settings could scope
                them, so `sources` is absent on those rows - hence the guard
                rather than an assumption the field is there. */}
            {briefing.sources && (
              <p className="relative mt-3 text-[11px] text-dim text-pretty">
                Built from {briefing.sources.holdings ? "your holdings" : "no holdings"}
                {briefing.sources.watchlist_ids
                  ? ` and ${briefing.sources.watchlist_ids.length} selected watchlist${briefing.sources.watchlist_ids.length === 1 ? "" : "s"}`
                  : " and every watchlist"}
                {briefing.sources.news_categories.length > 0 &&
                  `, filtered to ${briefing.sources.news_categories.length} news categor${briefing.sources.news_categories.length === 1 ? "y" : "ies"}`}
                . Change this in Settings &rsaquo; AI Assistant.
              </p>
            )}

            {briefing.upcoming_events.length > 0 && (
              <div className="relative mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
                {briefing.upcoming_events.slice(0, 3).map((e, i) => (
                  <div key={i} className="rounded-xl border border-line bg-canvas/55 px-3.25 py-3">
                    <div className="font-mono text-[9.5px] tracking-[0.12em] text-warning uppercase">
                      {e.event_type}
                    </div>
                    <div className="mt-1.75 text-[12.5px] leading-snug text-primary">{e.symbol}</div>
                    <div className="mt-1.5 text-[11px] text-dim">{e.event_date}</div>
                  </div>
                ))}
              </div>
            )}

            {briefing.analyses.length > 0 && (
              <div className="relative mt-4 flex flex-col gap-2">
                <div className="font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">Recent analyses</div>
                <div className="flex flex-wrap gap-2">
                  {briefing.analyses.slice(0, 6).map((a) => (
                    <Link
                      key={a.id}
                      href={`/ticker/${encodeURIComponent(a.scope_value)}`}
                      className="rounded-lg border border-line bg-canvas/55 px-2.5 py-1.5 text-[12px] hover:border-[#3A3A3A]"
                    >
                      <span className="text-primary">{a.scope_value}</span>{" "}
                      <span className="tabular-nums text-muted">
                        {a.probability_low}–{a.probability_high}%
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {briefing && (
          <div className="relative mt-4 border-t border-line pt-3">
            <Disclosure />
          </div>
        )}
      </div>
    </div>
  );
}
