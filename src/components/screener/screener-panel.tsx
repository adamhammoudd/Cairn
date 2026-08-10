"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { deleteSavedScreen, runScreen, saveScreen } from "@/lib/actions/screener";
import {
  ASSET_TYPES,
  EMPTY_FILTERS,
  formatMarketCap,
  type SavedScreen,
  type ScreenerFilters,
  type ScreenerRow,
} from "@/lib/screener";

function numOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

interface ScreenerPanelProps {
  initialRows: ScreenerRow[];
  savedScreens: SavedScreen[];
}

export function ScreenerPanel({ initialRows, savedScreens }: ScreenerPanelProps) {
  const [filters, setFilters] = useState<ScreenerFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<ScreenerRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [, startMutate] = useTransition();

  // Debounced re-query: filters are typed into, so fire 300ms after the last
  // keystroke rather than on every character.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const next = await runScreen(filters);
      if (!cancelled) {
        setRows(next);
        setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters]);

  function toggleAssetType(t: string) {
    setFilters((f) => ({
      ...f,
      assetTypes: f.assetTypes.includes(t) ? f.assetTypes.filter((x) => x !== t) : [...f.assetTypes, t],
    }));
  }

  function handleSave() {
    const name = window.prompt("Name this screen:");
    if (!name?.trim()) return;
    startMutate(() => saveScreen(name.trim(), filters));
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6">
      <aside className="flex flex-col gap-6">
        <div className="rounded-card border border-line bg-panel p-5">
          <div className="mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">Saved screens</div>
          {savedScreens.length === 0 ? (
            <p className="text-[12.5px] text-dim">None saved yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {savedScreens.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setFilters(s.filters)}
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted hover:bg-active hover:text-primary"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => startMutate(() => deleteSavedScreen(s.id))}
                    className="text-[12px] text-muted hover:text-negative"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-card border border-line bg-panel p-5">
          <div className="mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">Asset type</div>
          <div className="flex flex-col gap-2">
            {ASSET_TYPES.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-muted capitalize">
                <input
                  type="checkbox"
                  checked={filters.assetTypes.includes(t)}
                  onChange={() => toggleAssetType(t)}
                  className="accent-accent"
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-line bg-panel p-5">
          <div className="mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">Price</div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minPrice: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
          </div>

          <div className="mt-4 mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">% change</div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minChangePct: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxChangePct: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
          </div>

          <div className="mt-4 mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">Min volume</div>
          <input
            placeholder="e.g. 1000000"
            onChange={(e) => setFilters((f) => ({ ...f, minVolume: numOrNull(e.target.value) }))}
            className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
          />
        </div>

        <div className="rounded-card border border-line bg-panel p-5">
          <div className="mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">Market cap ($M)</div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minMarketCapM: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxMarketCapM: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
          </div>

          <div className="mt-4 mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">P/E ratio</div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minPe: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxPe: numOrNull(e.target.value) }))}
              className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
            />
          </div>

          <div className="mt-4 mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">Min dividend yield (%)</div>
          <input
            placeholder="e.g. 1.5"
            onChange={(e) => setFilters((f) => ({ ...f, minDividendYield: numOrNull(e.target.value) }))}
            className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
          />
        </div>

        <p className="text-[11.5px] leading-relaxed text-dim">
          Market cap, P/E, and dividend yield are derived from SEC XBRL filings against the latest
          close. Funds and ETFs don&apos;t file those concepts, so they show — and are excluded by
          those filters.
        </p>
      </aside>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[13px] text-muted">
            {loading ? "Filtering…" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary"
          >
            Save screen
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
            No symbols match these filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-panel">
            <div className="grid grid-cols-[1fr_0.7fr_0.8fr_0.7fr_0.9fr_0.9fr_0.6fr_0.7fr] border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase">
              <div>Symbol</div>
              <div>Type</div>
              <div>Price</div>
              <div>Change</div>
              <div>Volume</div>
              <div>Mkt cap</div>
              <div>P/E</div>
              <div>Yield</div>
            </div>
            {rows.map((r) => (
              <div
                key={r.symbol}
                className="grid grid-cols-[1fr_0.7fr_0.8fr_0.7fr_0.9fr_0.9fr_0.6fr_0.7fr] items-center border-b border-line px-5 py-3.5 last:border-b-0"
              >
                <Link href={`/ticker/${r.symbol}`} className="text-sm text-primary hover:text-accent">
                  {r.symbol}
                </Link>
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
                <div className="text-[13px] text-muted">
                  {r.volume === null ? "—" : r.volume.toLocaleString()}
                </div>
                <div className="text-[13px] text-primary">{formatMarketCap(r.marketCap)}</div>
                <div className="text-[13px] text-muted">{r.pe === null ? "—" : r.pe.toFixed(1)}</div>
                <div className="text-[13px] text-muted">
                  {r.dividendYield === null ? "—" : `${r.dividendYield.toFixed(2)}%`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
