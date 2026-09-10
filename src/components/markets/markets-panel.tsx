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

interface MarketsPanelProps {
  rows: ScreenerRow[];
  cryptoRows: CryptoRow[];
  /** Settings › Display default; which category the page opens on. */
  defaultFilter?: AssetFilter;
  /** symbol -> request_count from symbol_directory, for the Most searched deck. */
  requestCounts?: Record<string, number>;
}

const TABS = ["all", ...ASSET_TYPES] as const;

export function MarketsPanel({ rows, cryptoRows, defaultFilter = "all", requestCounts = {} }: MarketsPanelProps) {
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
      <div className="mb-5">
        <div className="mb-2 font-mono text-eyebrow text-muted uppercase">Markets</div>
        <h1 className="font-serif text-display leading-[1.1] font-normal text-primary">The whole board</h1>
        <p className="mt-2 max-w-[560px] text-lead text-muted text-pretty">
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
        <div className="flex flex-wrap gap-1.5 rounded-panel border border-line bg-panel p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-control px-3 py-2 text-body transition-colors duration-base ease-standard ${
                tab === t ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {ASSET_TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-panel border border-line bg-panel px-3 py-2 transition-colors duration-base ease-standard hover:border-line-strong focus-within:border-accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-dim)" strokeWidth="2" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter this view"
            className="w-full min-w-0 bg-transparent text-body text-primary placeholder:text-dim outline-none"
          />
        </div>
      </div>

      <p className="mb-2 text-caption text-dim">{deckMethod}</p>

      <TickerList
        rows={filtered}
        names={names}
        marketCaps={marketCaps}
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
