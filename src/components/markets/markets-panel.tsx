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
    <div>
      <div>
        <div>Markets</div>
        <h1>The whole board</h1>
        <p>
          Equities, ETFs, crypto, forex and indices in one filterable view.
        </p>
      </div>

      <div>
        <div>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}

 >
              {t}
            </button>
          ))}
        </div>
        <div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter this view"

 />
        </div>
      </div>

      {tab === "crypto" ? (
        <CryptoTable rows={cryptoRows} />
      ) : (
        <div>
          <div>
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

 >
              <div>
                <div

 >
                  {initialsOf(r.symbol)}
                </div>
                <div>{r.symbol}</div>
              </div>
              <div>
                <span

 >
                  {r.assetType}
                </span>
              </div>
              <div>
                {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
              </div>
              <div

 >
                {r.changePct === null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
              </div>
              <div>{r.volume === null ? "—" : r.volume.toLocaleString()}</div>
              <div>{formatMarketCap(r.marketCap)}</div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div>
              <div>
                <span />
                <span />
                <span />
              </div>
              <div>No marker here</div>
              <p>
                {query
                  ? `Nothing matches "${query}" in ${activeFilterLabel}. Try another asset type, or search the full universe.`
                  : `Nothing tracked yet in ${activeFilterLabel}.`}
              </p>
              <div>
                <button
                  type="button"
                  onClick={clearFilters}

 >
                  Clear filters
                </button>
                <Link
                  href="/assistant"

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
