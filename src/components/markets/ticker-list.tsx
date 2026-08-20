"use client";

import Link from "next/link";
import { ASSET_TYPE_LABEL, ASSET_TYPE_TAG_CLASS, formatMarketCap, formatVolume, type ScreenerRow } from "@/lib/screener";
import { assetName } from "@/lib/asset-names";

// The one ticker list. Every asset type on Markets renders through this --
// crypto used to get its own seven-column table, so switching the category
// filter changed the row layout, the hover treatment and the link behaviour
// mid-page. Crypto-only detail (CoinGecko name and market cap) arrives via
// `names`/`marketCaps` instead of a second component.
interface TickerListProps {
  rows: ScreenerRow[];
  /** Display names not covered by lib/asset-names (crypto comes from crypto_metrics). */
  names?: Record<string, string>;
  /** Market caps sourced outside fundamentals (crypto_metrics), keyed by symbol. */
  marketCaps?: Record<string, number | null>;
  emptyState?: React.ReactNode;
}

const GRID = "sm:grid-cols-[1.6fr_0.9fr_1fr_0.9fr_1fr_1fr_100px]";

function initialsOf(symbol: string) {
  return symbol.slice(0, 2).toUpperCase();
}

function trendPoints(values: number[], width: number, height: number) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function money(n: number | null) {
  return n === null ? "-" : n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function TickerList({ rows, names, marketCaps, emptyState }: TickerListProps) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div
        className={`hidden gap-3 border-b border-[#1E1E1E] px-5 py-2.75 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase sm:grid ${GRID}`}
      >
        <div>Asset</div>
        <div>Type</div>
        <div>Price</div>
        <div>24h</div>
        <div>Market cap</div>
        <div>Volume</div>
        <div>Trend</div>
      </div>

      {rows.map((r) => {
        const changeColor =
          r.changePct === null
            ? "var(--color-muted)"
            : r.changePct >= 0
              ? "var(--color-accent)"
              : "var(--color-negative)";
        const displayName = names?.[r.symbol] ?? assetName(r.symbol, ASSET_TYPE_LABEL[r.assetType] ?? r.assetType);
        const marketCap = marketCaps && r.symbol in marketCaps ? marketCaps[r.symbol] : r.marketCap;

        return (
          <Link
            key={r.symbol}
            href={`/ticker/${r.symbol}`}
            className={`block border-b border-[#171717] transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active sm:grid sm:items-center sm:gap-3 sm:px-5 sm:py-3 ${GRID}`}
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
                    <div className="truncate text-[11px] text-muted">{displayName}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] tabular-nums text-primary">{money(r.price)}</div>
                  <div
                    className={`mt-0.75 text-[11.5px] tabular-nums ${
                      r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                    }`}
                  >
                    {r.changePct === null ? "-" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
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
              <div className="min-w-0">
                <div className="text-[13px] text-primary">{r.symbol}</div>
                <div className="truncate text-[11px] text-muted">{displayName}</div>
              </div>
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
            <div className="hidden text-[12.5px] tabular-nums text-primary sm:block">{money(r.price)}</div>
            <div
              className={`hidden text-[12.5px] tabular-nums sm:block ${
                r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
              }`}
            >
              {r.changePct === null ? "-" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
            </div>
            <div className="hidden text-[12.5px] tabular-nums text-muted sm:block">{formatMarketCap(marketCap)}</div>
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
        );
      })}

      {rows.length === 0 && emptyState}
    </div>
  );
}
