"use client";

import Link from "next/link";
import { ASSET_TYPE_LABEL, ASSET_TYPE_TAG_CLASS, formatMarketCap, formatVolume, type ScreenerRow } from "@/lib/screener";
import { assetName } from "@/lib/asset-names";
import { Sparkline } from "@/components/sparkline";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatChange, formatMoney } from "@/lib/display-prefs";

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

export function TickerList({ rows, names, marketCaps, emptyState }: TickerListProps) {
  // Settings > Display: currency converts the price column, and the change
  // column follows the percent-vs-dollar choice. ScreenerRow carries only
  // changePct, so the dollar move is derived from it and the price rather than
  // the column silently staying in percent when the user asked for dollars.
  const prefs = useDisplayPrefs();
  const money = (n: number | null) => formatMoney(n, prefs);
  const change = (r: ScreenerRow) => formatChange(absoluteChangeFrom(r.price, r.changePct), r.changePct, prefs);

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
        // Name resolution, most specific first: crypto_metrics (passed in),
        // then the provider's own longName stored on symbol_directory at
        // ingest, then the seven-symbol static map, then the asset type. Before
        // the directory existed, every symbol outside that static map rendered
        // its asset type where a company name belongs.
        const displayName = names?.[r.symbol] ?? r.name ?? assetName(r.symbol, ASSET_TYPE_LABEL[r.assetType] ?? r.assetType);
        const marketCap = marketCaps && r.symbol in marketCaps ? marketCaps[r.symbol] : r.marketCap;

        return (
          <Link
            key={r.symbol}
            href={`/ticker/${r.symbol}`}
            className={`cn-row block border-b border-[#171717] transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active sm:grid sm:items-center sm:gap-3 sm:px-5 sm:py-3 ${GRID}`}
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
                    {change(r)}
                  </div>
                </div>
              </div>
              {r.trend.length > 1 && (
                <Sparkline values={r.trend} positive={(r.changePct ?? 0) >= 0} color={changeColor} className="h-7.5 w-full" />
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
              {change(r)}
            </div>
            <div
              className="hidden text-[12.5px] tabular-nums text-muted sm:block"
              title={marketCap === null ? "Market cap not reported for this asset" : undefined}
            >
              {formatMarketCap(marketCap, prefs)}
            </div>
            <div
              className="hidden text-[12.5px] tabular-nums text-muted sm:block"
              title={r.volume === null ? "Volume not reported for this asset" : undefined}
            >
              {formatVolume(r.volume)}
            </div>
            <div className="hidden sm:block">
              {r.trend.length > 1 && (
                <Sparkline values={r.trend} positive={(r.changePct ?? 0) >= 0} color={changeColor} className="h-6.5 w-23.5" />
              )}
            </div>
          </Link>
        );
      })}

      {rows.length === 0 && emptyState}
    </div>
  );
}
