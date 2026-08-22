"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/sparkline";
import { formatVolume, type ScreenerRow } from "@/lib/screener";

// The movers deck above the Markets table. Every card is derived from the same
// stored closes the table below shows - there is no separate "trending" feed,
// and nothing here is editorially picked. The deck says which measure it
// ranked by, because "trending" on its own is a claim with no method behind it.

interface TrendingDeckProps {
  rows: ScreenerRow[];
  /** symbol -> times requested, from symbol_directory. Real demand, not a guess. */
  requestCounts: Record<string, number>;
  /** Provider display names, for the subline. */
  names: Record<string, string>;
}

type DeckId = "gainers" | "losers" | "active" | "searched";

const DECKS: { id: DeckId; label: string; method: string }[] = [
  { id: "gainers", label: "Day gainers", method: "Ranked by the last session's percent change, largest first." },
  { id: "losers", label: "Day losers", method: "Ranked by the last session's percent change, most negative first." },
  { id: "active", label: "Most active", method: "Ranked by the last session's traded volume." },
  { id: "searched", label: "Most searched", method: "Ranked by how many times this deployment has been asked for the symbol." },
];

export function TrendingDeck({ rows, requestCounts, names }: TrendingDeckProps) {
  const [deck, setDeck] = useState<DeckId>("gainers");

  const items = useMemo(() => {
    const withChange = rows.filter((r) => r.changePct !== null);
    switch (deck) {
      case "gainers":
        return [...withChange].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 6);
      case "losers":
        return [...withChange].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 6);
      case "active":
        return [...rows].filter((r) => r.volume !== null).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 6);
      case "searched": {
        const candidates = rows.filter((r) => (requestCounts[r.symbol] ?? 0) > 0);
        const counts = candidates.map((r) => requestCounts[r.symbol]);
        // With every symbol on the same count there is no "most" to show, and
        // a stable sort would quietly fall back to whatever order the rows
        // arrived in - which is the gainers ranking wearing a popularity
        // label. Rank only when the counts actually differentiate.
        if (candidates.length === 0 || Math.max(...counts) === Math.min(...counts)) return [];
        return [...candidates]
          .sort(
            (a, b) =>
              (requestCounts[b.symbol] ?? 0) - (requestCounts[a.symbol] ?? 0) ||
              // Deterministic tie-break, so equal counts render the same order
              // on every load instead of following the incoming sort.
              a.symbol.localeCompare(b.symbol),
          )
          .slice(0, 6);
      }
    }
  }, [rows, deck, requestCounts]);

  const method = DECKS.find((d) => d.id === deck)?.method ?? "";

  return (
    <section aria-label="Market movers" className="mb-4.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-1.5 rounded-[11px] border border-line bg-panel p-1">
          {DECKS.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={deck === d.id}
              onClick={() => setDeck(d.id)}
              className={`rounded-lg px-3.25 py-1.75 text-[12.5px] transition-colors duration-base ease-standard ${
                deck === d.id ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <span className="max-w-[46ch] text-[11.5px] text-dim text-pretty">{method}</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-5 py-7 text-center text-[13px] text-muted text-pretty">
          {deck === "searched"
            ? "No symbol has been looked up more than any other yet, so there is nothing to rank. This deck fills in as the app is used."
            : "Nothing to rank here yet - no stored symbol carries the figure this deck sorts by."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-2.5">
          {items.map((r, i) => {
            const up = (r.changePct ?? 0) >= 0;
            return (
              <Link
                key={r.symbol}
                href={`/ticker/${encodeURIComponent(r.symbol)}`}
                className="group rounded-xl border border-[#232323] bg-panel px-3.5 py-3.25 transition-colors duration-base ease-standard hover:border-[#3A3A3A]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13.5px] text-primary">{r.symbol}</span>
                  <span className={`shrink-0 text-[12px] tabular-nums ${r.changePct === null ? "text-muted" : up ? "text-accent" : "text-negative"}`}>
                    {r.changePct === null ? "-" : `${up ? "+" : ""}${r.changePct.toFixed(2)}%`}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-dim">{r.name ?? names[r.symbol] ?? r.assetType}</div>
                <div className="mt-2">
                  <Sparkline values={r.trend} positive={up} delayMs={i * 40} className="h-6 w-full" />
                </div>
                <div className="mt-1.5 font-mono text-[9.5px] tracking-[0.1em] text-dim uppercase">
                  {deck === "active"
                    ? `Vol ${formatVolume(r.volume)}`
                    : deck === "searched"
                      ? `${requestCounts[r.symbol]} ${requestCounts[r.symbol] === 1 ? "request" : "requests"}`
                      : r.price === null
                        ? "-"
                        : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
