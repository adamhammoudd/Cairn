"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ASSET_TYPE_LABEL, ASSET_TYPES, type ScreenerRow } from "@/lib/screener";
import type { CryptoRow } from "@/lib/crypto";
import { TickerList } from "@/components/markets/ticker-list";
import type { AssetFilter } from "@/lib/supabase/types";

interface MarketsPanelProps {
  rows: ScreenerRow[];
  cryptoRows: CryptoRow[];
  /** Settings › Display default; which category the page opens on. */
  defaultFilter?: AssetFilter;
}

const TABS = ["all", ...ASSET_TYPES] as const;

export function MarketsPanel({ rows, cryptoRows, defaultFilter = "all" }: MarketsPanelProps) {
  const [tab, setTab] = useState<AssetFilter>(defaultFilter);
  const [query, setQuery] = useState("");

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
    return q
      ? base.filter((r) => r.symbol.toUpperCase().includes(q) || (names[r.symbol] ?? "").toUpperCase().includes(q))
      : base;
  }, [rows, tab, query, names]);

  const activeFilterLabel = tab === "all" ? "the full universe" : `${tab} symbols`;

  function clearFilters() {
    setTab("all");
    setQuery("");
  }

  return (
    <div className="animate-page-in">
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Markets</div>
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">The whole board</h1>
        <p className="mt-1.75 max-w-[560px] text-[13.5px] text-muted text-pretty">
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
              className={`rounded-lg px-3.25 py-1.75 text-[12.5px] transition-colors duration-base ease-standard ${
                tab === t ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {ASSET_TYPE_LABEL[t] ?? t}
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
          <div className="hidden grid-cols-[1.6fr_0.9fr_1fr_0.9fr_1fr_100px] gap-3 border-b border-[#1E1E1E] px-5 py-2.75 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase sm:grid">
            <div>Asset</div>
            <div>Type</div>
            <div>Price</div>
            <div>24h</div>
            <div>Volume</div>
            <div>Trend</div>
          </div>
          {filtered.map((r) => {
            const changeColor = r.changePct === null ? "var(--color-muted)" : r.changePct >= 0 ? "var(--color-accent)" : "var(--color-negative)";
            return (
              <Link
                key={r.symbol}
                href={`/ticker/${r.symbol}`}
                className="block border-b border-[#171717] transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active sm:grid sm:grid-cols-[1.6fr_0.9fr_1fr_0.9fr_1fr_100px] sm:items-center sm:gap-3 sm:px-5 sm:py-3"
              >
                {/* Phone (<640px): the mock collapses the row into a card. */}
                <div className="flex flex-col gap-2 px-4 py-3.5 sm:hidden">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] text-canvas"
                        style={{
                          backgroundImage:
                            r.changePct === null || r.changePct >= 0
                              ? "linear-gradient(135deg, var(--color-accent-light), var(--color-accent-dark))"
                              : "linear-gradient(135deg, #E39B9B, #C25A5A)",
                        }}
                      >
                        {initialsOf(r.symbol)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] text-primary">{r.symbol}</div>
                        <div className="truncate text-[11px] text-muted capitalize">{r.assetType}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] tabular-nums text-primary">
                        {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                      </div>
                      <div
                        className={`mt-0.75 text-[11.5px] tabular-nums ${
                          r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                        }`}
                      >
                        {r.changePct === null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                      </div>
                    </div>
                  </div>
                  {r.trend.length > 1 && (
                    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="block h-7.5 w-full">
                      <polyline
                        points={trendPoints(r.trend, 100, 28)}
                        fill="none"
                        stroke={changeColor}
                        strokeWidth={1.6}
                        vectorEffect="non-scaling-stroke"
                        pathLength="1"
                        strokeDasharray="1"
                        className="animate-draw"
                      />
                    </svg>
                  )}
                </div>

                <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
                  <div
                    className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg font-mono text-[9.5px] text-canvas"
                    style={{
                      backgroundImage:
                        r.changePct === null || r.changePct >= 0
                          ? "linear-gradient(135deg, var(--color-accent-light), var(--color-accent-dark))"
                          : "linear-gradient(135deg, #E39B9B, #C25A5A)",
                    }}
                  >
                    {initialsOf(r.symbol)}
                  </div>
                  <div className="min-w-0 text-sm text-primary">{r.symbol}</div>
                </div>
                <div className="hidden sm:block">
                  <span
                    className={`rounded-full border px-2 py-0.75 font-mono text-[9.5px] tracking-[0.1em] uppercase ${
                      ASSET_TYPE_TAG_CLASS[r.assetType] ?? "text-muted border-line"
                    }`}
                  >
                    {r.assetType}
                  </span>
                </div>
                <div className="hidden text-[12.5px] tabular-nums text-primary sm:block">
                  {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </div>
                <div
                  className={`hidden text-[12.5px] tabular-nums sm:block ${
                    r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                  }`}
                >
                  {r.changePct === null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                </div>
                <div className="hidden text-[12.5px] tabular-nums text-muted sm:block">{formatVolume(r.volume)}</div>
                <div className="hidden sm:block">
                  {r.trend.length > 1 && (
                    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="block h-6.5 w-23.5">
                      <polyline
                        points={trendPoints(r.trend, 100, 28)}
                        fill="none"
                        stroke={changeColor}
                        strokeWidth={1.6}
                        vectorEffect="non-scaling-stroke"
                        pathLength="1"
                        strokeDasharray="1"
                        className="animate-draw"
                      />
                    </svg>
                  )}
                </div>
              </Link>
            </div>
          </div>
        }
      />
    </div>
  );
}
