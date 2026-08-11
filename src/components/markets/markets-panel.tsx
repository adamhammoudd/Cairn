"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ASSET_TYPES, formatMarketCap, type ScreenerRow } from "@/lib/screener";

interface MarketsPanelProps {
  rows: ScreenerRow[];
}

const TABS = ["all", ...ASSET_TYPES] as const;

export function MarketsPanel({ rows }: MarketsPanelProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");

  const filtered = useMemo(
    () => (tab === "all" ? rows : rows.filter((r) => r.assetType === tab)),
    [rows, tab]
  );

  return (
    <div>
      <div className="mb-5 flex items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] capitalize transition-colors duration-fast ease-standard ${
              tab === t ? "bg-active text-primary" : "text-muted hover:text-primary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No {tab === "all" ? "" : `${tab} `}symbols tracked yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="grid grid-cols-[1fr_0.7fr_0.8fr_0.7fr_0.9fr_0.9fr] border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase">
            <div>Symbol</div>
            <div>Type</div>
            <div>Price</div>
            <div>Change</div>
            <div>Volume</div>
            <div>Mkt cap</div>
          </div>
          {filtered.map((r) => (
            <Link
              key={r.symbol}
              href={`/ticker/${r.symbol}`}
              className="grid grid-cols-[1fr_0.7fr_0.8fr_0.7fr_0.9fr_0.9fr] items-center border-b border-line px-5 py-3.5 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
            >
              <div className="text-sm text-primary">{r.symbol}</div>
              <div className="text-[12.5px] text-muted capitalize">{r.assetType}</div>
              <div className="text-[13.5px] text-primary">
                {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
              </div>
              <div
                className={`text-[13px] ${
                  r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                }`}
              >
                {r.changePct === null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
              </div>
              <div className="text-[13px] text-muted">{r.volume === null ? "—" : r.volume.toLocaleString()}</div>
              <div className="text-[13px] text-primary">{formatMarketCap(r.marketCap)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
