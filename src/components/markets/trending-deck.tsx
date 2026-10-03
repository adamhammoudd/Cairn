"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Sparkline } from "@/components/sparkline";
import { formatVolume, type ScreenerRow } from "@/lib/screener";
import { assetName } from "@/lib/asset-names";
import { formatAssetMoney } from "@/lib/display-prefs";
import { DECKS, deckComparator, deckHasSignal, deckValue, type DeckId } from "@/lib/market-decks";

// The movers deck above the Markets table. Every card is derived from the same
// stored closes the table below shows - there is no separate "trending" feed,
// and nothing here is editorially picked. The deck says which measure it
// ranked by, because "trending" on its own is a claim with no method behind it.
//
// `deck` is owned by the parent (MarketsPanel), not this component - the
// ranked table underneath needs the same selection to sort by, and two
// components each keeping their own copy of "which tab is active" is exactly
// how they drifted apart before (see lib/market-decks.ts).

interface TrendingDeckProps {
  rows: ScreenerRow[];
  /** symbol -> times requested, from symbol_directory. Real demand, not a guess. */
  requestCounts: Record<string, number>;
  /** Provider display names, for the subline. */
  names: Record<string, string>;
  deck: DeckId;
  onDeckChange: (deck: DeckId) => void;
}

export function TrendingDeck({ rows, requestCounts, names, deck, onDeckChange }: TrendingDeckProps) {

  const items = useMemo(() => {
    if (!deckHasSignal(rows, deck, requestCounts)) return [];
    return rows
      .filter((r) => deckValue(r, deck, requestCounts) !== null)
      .sort(deckComparator(deck, requestCounts))
      .slice(0, 6);
  }, [rows, deck, requestCounts]);

  const method = DECKS.find((d) => d.id === deck)?.method ?? "";

  return (
    <section
      aria-label="Market movers"
      className="animate-rise-in relative mb-3.5 overflow-hidden rounded-2xl border border-line-soft px-[22px] py-5"
      style={{ background: "linear-gradient(180deg,var(--color-panel),var(--color-panel))" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          inset: "-60% 55% 45% -12%",
          background: "radial-gradient(closest-side, rgba(47,198,133,.16), transparent)",
          animation: "cn-glow 7s ease-in-out infinite",
        }}
      />
      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-[3px] rounded-[11px] border border-line-soft bg-canvas p-[3px]">
          {DECKS.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={deck === d.id}
              onClick={() => onDeckChange(d.id)}
              className={`rounded-[9px] px-[13px] py-[7px] text-[12.5px] whitespace-nowrap transition-colors duration-base ease-standard ${
                deck === d.id ? "bg-line-soft text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <span className="max-w-[46ch] text-caption text-dim text-pretty">{method}</span>
      </div>

      {items.length === 0 ? (
        <div className="relative rounded-[13px] border border-dashed border-line px-5 py-7 text-center text-body text-muted text-pretty">
          {deck === "searched"
            ? "No symbol has been looked up more than any other yet, so there is nothing to rank. This deck fills in as the app is used."
            : "Nothing to rank here yet - no stored symbol carries the figure this deck sorts by."}
        </div>
      ) : (
        <div className="relative grid grid-cols-[repeat(auto-fit,minmax(184px,1fr))] gap-[11px]">
          {items.map((r, i) => {
            const up = (r.changePct ?? 0) >= 0;
            return (
              <Link
                key={r.symbol}
                href={`/ticker/${encodeURIComponent(r.symbol)}`}
                className="group flex flex-col gap-1.5 rounded-[13px] border border-line-soft bg-panel px-3.5 py-[13px] transition-[transform,border-color,background] duration-[220ms] ease-standard hover:-translate-y-[3px] hover:border-line-strong hover:bg-raised"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13.5px] font-semibold tracking-[0.01em] text-primary">{r.symbol}</span>
                  <span className={`shrink-0 font-mono text-caption tabular-nums ${r.changePct === null ? "text-muted" : up ? "text-accent" : "text-negative"}`}>
                    {r.changePct === null ? "-" : `${up ? "+" : ""}${r.changePct.toFixed(2)}%`}
                  </span>
                </div>
                {/* Same name-resolution order as ticker-list.tsx: this deck
                    was missing the seven-symbol static-map fallback, so any
                    of those symbols with no symbol_directory.name yet (AMZN,
                    confirmed - the whole original seven are null) fell all
                    the way through to the raw asset type as its "name". */}
                <div className="truncate text-[11.5px] text-dim">
                  {r.name ?? names[r.symbol] ?? assetName(r.symbol, r.assetType)}
                </div>
                <Sparkline values={r.trend} positive={up} delayMs={120 + i * 60} className="h-8.5 w-full" />
                {/* The eyebrow shows the card's price on every deck except
                    "active" (which shows the volume it ranked by). The
                    "searched" deck used to print the raw request count here
                    ("2 REQUESTS") - an internal demand metric that read as a
                    debug label; the deck's own method caption already says it
                    ranks by lookups, and the asset name is on the line above. */}
                <div className="font-mono text-[11.5px] text-muted">
                  {deck === "active" ? `Vol ${formatVolume(r.volume)}` : formatAssetMoney(r.price, r.currency)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
