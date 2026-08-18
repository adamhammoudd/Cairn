"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ASSET_TYPE_TAG_CLASS, ASSET_TYPES, formatMarketCap, type ScreenerRow } from "@/lib/screener";
import type { CryptoRow } from "@/lib/crypto";
import { CryptoTable } from "@/components/crypto/crypto-table";

interface MarketsPanelProps {
  rows: ScreenerRow[];
  cryptoRows: CryptoRow[];
}

const TABS = ["all", ...ASSET_TYPES] as const;

function initialsOf(symbol: string) {
  return symbol.slice(0, 2).toUpperCase();
}

export function MarketsPanel({ rows, cryptoRows }: MarketsPanelProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [query, setQuery] = useState("");

  // "all" excludes crypto's generic screener row so it isn't listed twice --
  // crypto gets its own richer table (rank, 24h change, supply) below.
  const filtered = useMemo(() => {
    if (tab === "crypto") return [];
    const base = tab === "all" ? rows.filter((r) => r.assetType !== "crypto") : rows.filter((r) => r.assetType === tab);
    const q = query.trim().toUpperCase();
    return q ? base.filter((r) => r.symbol.toUpperCase().includes(q)) : base;
  }, [rows, tab, query]);

  const activeFilterLabel = tab === "all" ? "the full universe" : `${tab} symbols`;

  function clearFilters() {
    setTab("all");
    setQuery("");
  }

  return (
    <div className="animate-page-in">
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Markets</div>
        <h1 className="font-serif text-[32px] leading-tight font-normal text-primary">The whole board</h1>
        <p className="mt-1.5 max-w-[560px] text-[13.5px] text-muted text-pretty">
          Equities, ETFs, crypto, forex and indices in one filterable view.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1.5 rounded-[11px] border border-line bg-panel p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3.5 py-1.5 text-[12.5px] capitalize transition-colors duration-fast ease-standard ${
                tab === t ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[11px] border border-line bg-panel px-3 py-2 transition-colors duration-base ease-standard hover:border-[#3A3A3A]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" strokeWidth="2" className="shrink-0">
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

      {tab === "crypto" ? (
        <CryptoTable rows={cryptoRows} />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="grid grid-cols-[1.6fr_0.7fr_0.8fr_0.7fr_0.9fr_0.9fr] gap-3 border-b border-line px-5 py-2.75 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">
            <div>Asset</div>
            <div>Type</div>
            <div>Price</div>
            <div>24h</div>
            <div>Volume</div>
            <div>Mkt cap</div>
          </div>
          {filtered.map((r) => (
            <Link
              key={r.symbol}
              href={`/ticker/${r.symbol}`}
              className="grid grid-cols-[1.6fr_0.7fr_0.8fr_0.7fr_0.9fr_0.9fr] items-center gap-3 border-b border-line px-5 py-3 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={`flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg border bg-active font-mono text-[9.5px] ${
                    ASSET_TYPE_TAG_CLASS[r.assetType] ?? "text-muted border-line"
                  }`}
                >
                  {initialsOf(r.symbol)}
                </div>
                <div className="min-w-0 text-sm text-primary">{r.symbol}</div>
              </div>
              <div>
                <span
                  className={`rounded-full border px-2 py-0.75 font-mono text-[9.5px] tracking-[0.1em] uppercase ${
                    ASSET_TYPE_TAG_CLASS[r.assetType] ?? "text-muted border-line"
                  }`}
                >
                  {r.assetType}
                </span>
              </div>
              <div className="text-[12.5px] tabular-nums text-primary">
                {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
              </div>
              <div
                className={`text-[12.5px] tabular-nums ${
                  r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                }`}
              >
                {r.changePct === null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
              </div>
              <div className="text-[12.5px] tabular-nums text-muted">{r.volume === null ? "—" : r.volume.toLocaleString()}</div>
              <div className="text-[12.5px] tabular-nums text-primary">{formatMarketCap(r.marketCap)}</div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="px-6 py-16 text-center">
              <div className="mb-4.5 flex items-end justify-center gap-1.25">
                <span className="h-2.25 w-8.5 rounded-full bg-[#1E1E1E]" />
                <span className="h-2.25 w-6.5 rounded-full bg-[#1E1E1E]" />
                <span className="h-2.25 w-4.5 rounded-full bg-[#262626]" />
              </div>
              <div className="font-serif text-[21px] text-primary">No marker here</div>
              <p className="mx-auto mt-2 mb-4.5 max-w-[400px] text-[13px] text-muted text-pretty">
                {query
                  ? `Nothing matches "${query}" in ${activeFilterLabel}. Try another asset type, or search the full universe.`
                  : `Nothing tracked yet in ${activeFilterLabel}.`}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2.25 text-[12.5px] font-semibold text-canvas"
                >
                  Clear filters
                </button>
                <Link
                  href="/assistant"
                  className="rounded-[10px] border border-line px-4 py-2.25 text-[12.5px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A]"
                >
                  Ask the assistant
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
