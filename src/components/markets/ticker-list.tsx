"use client";

import Link from "next/link";
import { ASSET_TYPE_LABEL, ASSET_TYPE_TAG_CLASS, assetTypeBadge, formatMarketCap, formatVolume, type ScreenerRow } from "@/lib/screener";
import { assetName } from "@/lib/asset-names";
import { Sparkline } from "@/components/sparkline";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatAssetChange, formatAssetMoney, pricesInLabel } from "@/lib/display-prefs";

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
  /** Date of the newest close behind these rows, for the table's own footer. */
  asOf?: string | null;
}

// The design's proportions, plus the Volume column it drops. Volume stays:
// the "Most active" deck above ranks by it, and a ranking whose measure is
// nowhere in the table it sorts is a ranking you cannot check.
const GRID = "sm:grid-cols-[minmax(0,2.2fr)_92px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_92px]";

function initialsOf(symbol: string) {
  return symbol.slice(0, 2).toUpperCase();
}

export function TickerList({ rows, names, marketCaps, emptyState, asOf = null }: TickerListProps) {
  // Every figure here describes an asset, so it is in that asset's own
  // currency and never converted (feat/native-currency); the footer names it
  // once. The change column follows Settings > Display's percent-vs-money
  // choice. ScreenerRow carries only changePct, so the money move is derived
  // from it and the price rather than the column silently staying in percent.
  const prefs = useDisplayPrefs();
  const money = (r: ScreenerRow) => formatAssetMoney(r.price, r.currency);
  // The 24h bar is scaled to the largest move on screen, not to a fixed span:
  // on a quiet day a 0.4% move should still read as the biggest one here.
  const maxAbsPct = Math.max(...rows.map((r) => Math.abs(r.changePct ?? 0)), 1);
  const change = (r: ScreenerRow) => formatAssetChange(absoluteChangeFrom(r.price, r.changePct), r.changePct, r.currency, prefs);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#232323] bg-panel">
      <div
        className={`hidden gap-3.5 border-b border-[#1c1c1c] bg-[#0c0c0c] px-5 py-3 font-mono text-eyebrow tracking-[0.16em] text-dim uppercase sm:grid ${GRID}`}
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
            className={`cn-row block border-b border-[#171717] transition-colors duration-fast ease-standard last:border-b-0 hover:bg-raised sm:grid sm:items-center sm:gap-3.5 sm:px-5 sm:py-3 ${GRID}`}
          >
            {/* Phone (<640px): the mock collapses the row into a card. */}
            <div className="flex flex-col gap-2 px-4 py-3.5 sm:hidden">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control font-mono text-eyebrow text-canvas"
                    style={{
                      backgroundImage:
                        r.changePct === null || r.changePct >= 0
                          ? "linear-gradient(135deg, var(--color-accent-light), var(--color-accent-dark))"
                          : "var(--gradient-loss)",
                    }}
                  >
                    {initialsOf(r.symbol)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-lead text-primary">{r.symbol}</div>
                    <div className="truncate text-micro text-muted">{displayName}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-body tabular-nums text-primary">{money(r)}</div>
                  <div
                    className={`mt-1 text-caption tabular-nums ${
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
              {/* Tinted by asset type, not by gain/loss. The row already
                  says which way it moved in two places; the avatar is the one
                  slot free to carry what the thing *is*. */}
              <div
                className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[9px] border bg-panel font-mono text-[10.5px] ${
                  ASSET_TYPE_TAG_CLASS[r.assetType] ?? "text-muted border-line"
                }`}
              >
                {initialsOf(r.symbol)}
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold tracking-[0.01em] text-primary">{r.symbol}</div>
                <div className="truncate text-[11.5px] text-dim">{displayName}</div>
              </div>
            </div>
            <div className="hidden sm:block">
              <span
                className={`rounded-full border px-[9px] py-[3px] font-mono text-[9.5px] tracking-[0.12em] uppercase ${
                  ASSET_TYPE_TAG_CLASS[r.assetType] ?? "text-muted border-line"
                }`}
              >
                {assetTypeBadge(r.assetType)}
              </span>
            </div>
            <div className="hidden font-mono text-[12.5px] tabular-nums text-primary sm:block">{money(r)}</div>
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <span
                className={`shrink-0 font-mono text-[12.5px] tabular-nums ${
                  r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                }`}
              >
                {change(r)}
              </span>
              {r.changePct !== null && (
                <span aria-hidden className="h-1 min-w-0 flex-1 overflow-hidden rounded-xs bg-[#191919]">
                  <span
                    className={`block h-full origin-left rounded-xs opacity-65 ${
                      r.changePct >= 0 ? "bg-accent" : "bg-negative"
                    }`}
                    style={{ width: `${Math.max(4, (Math.abs(r.changePct) / maxAbsPct) * 100).toFixed(0)}%` }}
                  />
                </span>
              )}
            </div>
            <div
              className="hidden font-mono text-[12.5px] tabular-nums text-muted sm:block"
              title={marketCap === null ? "Market cap not reported for this asset" : undefined}
            >
              {formatMarketCap(marketCap, r.currency)}
            </div>
            <div
              className="hidden font-mono text-[12.5px] tabular-nums text-muted sm:block"
              title={r.volume === null ? "Volume not reported for this asset" : undefined}
            >
              {formatVolume(r.volume)}
            </div>
            <div className="hidden sm:block">
              {r.trend.length > 1 && (
                <Sparkline values={r.trend} positive={(r.changePct ?? 0) >= 0} color={changeColor} className="h-7.5 w-23" />
              )}
            </div>
          </Link>
        );
      })}

      {rows.length === 0 && emptyState}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#1c1c1c] bg-[#0c0c0c] px-5 py-3 text-caption text-dim">
          <span>
            {rows.length} {rows.length === 1 ? "symbol" : "symbols"} · {pricesInLabel(rows.map((r) => r.currency))}
          </span>
          {asOf && (
            <span className="flex items-center gap-[7px]">
              <span aria-hidden className="animate-breathe h-1.5 w-1.5 rounded-full bg-accent" />
              Updated at close · {asOf}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
