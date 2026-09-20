"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ASSET_TYPE_LABEL, ASSET_TYPES, type ScreenerRow } from "@/lib/screener";
import type { CryptoRow } from "@/lib/crypto";
import { TickerList } from "@/components/markets/ticker-list";
import { TrendingDeck } from "@/components/markets/trending-deck";
import { DataFreshness } from "@/components/data-freshness";
import type { AssetFilter } from "@/lib/supabase/types";
import { DECKS, deckComparator, type DeckId } from "@/lib/market-decks";
import { TickerStrip, type TickerStripItem } from "@/components/dashboard/ticker-strip";

interface MarketsPanelProps {
  rows: ScreenerRow[];
  cryptoRows: CryptoRow[];
  /** Settings › Display default; which category the page opens on. */
  defaultFilter?: AssetFilter;
  /** symbol -> request_count from symbol_directory, for the Most searched deck. */
  requestCounts?: Record<string, number>;
  /** Top absolute movers across the full board, for the strip under the header. */
  tickerItems?: TickerStripItem[];
}

const TABS = ["all", ...ASSET_TYPES] as const;

export function MarketsPanel({
  rows,
  cryptoRows,
  defaultFilter = "all",
  requestCounts = {},
  tickerItems = [],
}: MarketsPanelProps) {
  const [tab, setTab] = useState<AssetFilter>(defaultFilter);
  const [query, setQuery] = useState("");
  // Owned here, not inside TrendingDeck - the ranked table below needs the
  // same selection to sort by (see lib/market-decks.ts for why they used to
  // drift apart).
  const [deck, setDeck] = useState<DeckId>("gainers");

  // crypto_metrics carries the display name and a market cap the fundamentals
  // table can't derive (no shares outstanding for a coin). Merged in here so
  // crypto rows keep that detail while still rendering through the one list.
  const { names, marketCaps } = useMemo(() => {
    const names: Record<string, string> = {};
    const marketCaps: Record<string, number | null> = {};
    for (const c of cryptoRows) {
      names[c.symbol] = c.name;
      marketCaps[c.symbol] = c.marketCap;
    }
    return { names, marketCaps };
  }, [cryptoRows]);

  const filtered = useMemo(() => {
    const base = tab === "all" ? rows : rows.filter((r) => r.assetType === tab);
    const q = query.trim().toUpperCase();
    const matched = q
      ? base.filter((r) => r.symbol.toUpperCase().includes(q) || (names[r.symbol] ?? "").toUpperCase().includes(q))
      : base;
    // Same ranking the deck row above is showing, applied to the full
    // (tab + search filtered) set rather than just its top 6 - the table no
    // longer stays on whatever order runScreen() happened to return while
    // the cards above it change tabs.
    return [...matched].sort(deckComparator(deck, requestCounts));
  }, [rows, tab, query, names, deck, requestCounts]);

  const activeFilterLabel = tab === "all" ? "the full universe" : `${tab} symbols`;
  const deckMethod = DECKS.find((d) => d.id === deck)?.method ?? "";

  // Newest bar behind any row on screen.
  const asOf = useMemo(() => rows.reduce<string | null>((newest, r) => (r.asOf && (!newest || r.asOf > newest) ? r.asOf : newest), null), [rows]);

  function clearFilters() {
    setTab("all");
    setQuery("");
  }

  return (
    <div className="animate-page-in">
      {tickerItems.length > 0 && (
        // Same edge-to-edge breakout Base Camp uses for its strip (see
        // dashboard/ticker-strip.tsx) - the design shows this band under the
        // header on every top-level board, not just Base Camp.
        <div className="relative left-1/2 -mt-6.5 mb-5 w-[calc(100vw-var(--sbw,0px))] -translate-x-1/2">
          <TickerStrip items={tickerItems} />
        </div>
      )}
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Markets</div>
        <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">The whole board</h1>
        <p className="mt-2 max-w-[540px] text-[13.5px] leading-[1.55] text-muted text-pretty">
          Equities, ETFs, crypto, forex and indices in one filterable view. Any symbol the data provider carries is
          fetched the first time it is searched for.
        </p>
        {/* Every price in this table is a stored daily close. The ticker page
            said so; this one did not, and the two are the same numbers. */}
        <div className="mt-2.5">
          <DataFreshness source="last_close" asOf={asOf} />
        </div>
      </div>

      <TrendingDeck rows={rows} requestCounts={requestCounts} names={names} deck={deck} onDeckChange={setDeck} />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-[3px] rounded-[11px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
          {TABS.map((t) => {
            const on = tab === t;
            // The count is the honest part of a filter chip: it says what is
            // behind the tab before you spend a click finding out it is empty.
            const count = t === "all" ? rows.length : rows.filter((r) => r.assetType === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`inline-flex items-center gap-[7px] rounded-[9px] px-[13px] py-[7px] text-[12.5px] whitespace-nowrap transition-colors duration-base ease-standard ${
                  on ? "bg-[#1e1e1e] text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {ASSET_TYPE_LABEL[t] ?? t}
                <span
                  className={`rounded-[5px] px-[5px] py-px font-mono text-eyebrow ${
                    on ? "bg-accent/15 text-accent-light" : "bg-[#161616] text-dim"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[11px] border border-line bg-panel px-3.5 py-[9px] transition-colors duration-base ease-standard hover:border-line-strong focus-within:border-accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-dim)" strokeWidth="2" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter this view"
            className="w-full min-w-0 bg-transparent text-[12.5px] text-primary placeholder:text-dim outline-none"
          />
        </div>
      </div>

      <p className="mb-2 text-caption text-dim">{deckMethod}</p>

      <TickerList
        rows={filtered}
        names={names}
        marketCaps={marketCaps}
        asOf={asOf}
        emptyState={
          <div className="px-6 py-16 text-center">
            <div className="mb-4.5 flex items-end justify-center gap-1">
              <span className="h-2 w-8.5 rounded-full bg-active" />
              <span className="h-2 w-6.5 rounded-full bg-active" />
              <span className="h-2 w-4.5 rounded-full bg-active" />
            </div>
            <div className="font-serif text-h3 text-primary">No marker here</div>
            <p className="mx-auto mt-2 mb-4.5 max-w-[400px] text-body text-muted text-pretty">
              {query
                ? `Nothing matches "${query}" in ${activeFilterLabel}. Try another asset type, or search the full universe.`
                : `Nothing tracked yet in ${activeFilterLabel}.`}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-body font-semibold text-canvas"
              >
                Clear filters
              </button>
              <Link
                href="/assistant"
                className="rounded-panel border border-line px-4 py-2 text-body text-primary transition-colors duration-base ease-standard hover:border-line-strong"
              >
                Ask the assistant
              </Link>
            </div>
          </div>
        }
      />
    </div>
  );
}
