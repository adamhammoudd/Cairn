"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { deleteSavedScreen, runScreen, saveScreen } from "@/lib/actions/screener";
import {
  ASSET_TYPE_LABEL,
  ASSET_TYPE_TAG_CLASS,
  ASSET_TYPES,
  EMPTY_FILTERS,
  formatMarketCap,
  formatVolume,
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 mb-2 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase first:mt-0">{children}</div>;
}

const NUM_INPUT_CLASS =
  "w-full rounded-[10px] border border-line bg-[#0B0B0B] px-3 py-2.5 text-[12.5px] text-primary outline-none transition-colors duration-fast ease-standard placeholder:text-dim focus:border-accent";

export function ScreenerPanel({ initialRows, savedScreens: initialSavedScreens }: ScreenerPanelProps) {
  const [filters, setFilters] = useState<ScreenerFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<ScreenerRow[]>(initialRows);
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>(initialSavedScreens);
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
    startMutate(async () => {
      await saveScreen(name.trim(), filters);
      setSavedScreens((prev) => [...prev, { id: crypto.randomUUID(), name: name.trim(), filters }]);
    });
  }

  function handleDelete(id: string) {
    startMutate(() => deleteSavedScreen(id));
    setSavedScreens((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="animate-page-in">
      <div className="mb-4.5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Markets · Screener</div>
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">Screener</h1>
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[232px_1fr]">
        <aside className="rounded-card border border-line bg-panel p-4.5">
          <div className="font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">Asset type</div>
          <div className="mt-2.25 flex flex-wrap gap-1.5">
            {ASSET_TYPES.map((t) => {
              const active = filters.assetTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleAssetType(t)}
                  className={`rounded-full border px-2.75 py-1.5 text-[11.5px] transition-colors duration-fast ease-standard hover:border-[#3A3A3A] ${
                    active ? "border-accent bg-accent/10 text-primary" : "border-line bg-transparent text-muted"
                  }`}
                >
                  {ASSET_TYPE_LABEL[t] ?? t}
                </button>
              );
            })}
          </div>

          <FieldLabel>Price</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minPrice: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>% change</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minChangePct: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxChangePct: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>Min volume</FieldLabel>
          <input
            placeholder="e.g. 1000000"
            onChange={(e) => setFilters((f) => ({ ...f, minVolume: numOrNull(e.target.value) }))}
            className={NUM_INPUT_CLASS}
          />

          <FieldLabel>Market cap ($M)</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minMarketCapM: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxMarketCapM: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>P/E ratio</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minPe: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxPe: numOrNull(e.target.value) }))}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>Min dividend yield (%)</FieldLabel>
          <input
            placeholder="e.g. 1.5"
            onChange={(e) => setFilters((f) => ({ ...f, minDividendYield: numOrNull(e.target.value) }))}
            className={NUM_INPUT_CLASS}
          />

          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="mt-4 w-full rounded-[10px] border border-line bg-transparent py-2.25 text-[12px] text-muted transition-colors duration-fast ease-standard hover:border-[#3A3A3A] hover:text-primary"
          >
            Reset filters
          </button>

          <div className="mt-4.5 mb-2.25 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">Saved screens</div>
          {savedScreens.length === 0 ? (
            <p className="text-[12.5px] text-dim">None saved yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {savedScreens.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setFilters(s.filters)}
                    className="flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[12.5px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="text-[12px] text-dim transition-colors duration-fast ease-standard hover:text-negative"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4.5 text-[11.5px] leading-relaxed text-dim">
            Market cap, P/E, and dividend yield are derived from SEC XBRL filings against the latest
            close. Funds and ETFs don&apos;t file those concepts, so they&apos;re excluded by those
            filters.
          </p>
        </aside>

        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4.5 py-3">
            <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              {loading ? "Filtering…" : `${rows.length} match${rows.length === 1 ? "" : "es"}`}
            </span>
            <div className="flex items-center gap-3">
              <span className="hidden text-[11.5px] text-dim sm:inline">Market cap derived at query time</span>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg border border-line px-3 py-1.75 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:border-[#3A3A3A]"
              >
                Save screen
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-15 text-center">
              <div className="font-serif text-[20px] text-primary">No asset clears every filter</div>
              <p className="mx-auto mt-2 mb-4.5 max-w-[380px] text-[13px] text-muted text-pretty">
                Loosen one constraint at a time — price and change are usually the binding pair.
              </p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2.25 text-[12.5px] font-semibold text-canvas"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_0.7fr_0.8fr] gap-2.5 border-b border-line px-4.5 py-2.5 font-mono text-[9.5px] tracking-[0.1em] text-dim uppercase">
                <div>Symbol</div>
                <div>Type</div>
                <div>Price</div>
                <div>24h</div>
                <div>Volume</div>
                <div>Mkt cap</div>
                <div>P/E</div>
                <div>Yield</div>
              </div>
              {rows.map((r, index) => (
                <Link
                  key={r.symbol}
                  href={`/ticker/${r.symbol}`}
                  className="animate-rise-in grid grid-cols-[1fr_0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_0.7fr_0.8fr] items-center gap-2.5 border-b border-line px-4.5 py-3 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
                  style={{ animationDelay: `${index * 25}ms` }}
                >
                  <div className="text-sm text-primary">{r.symbol}</div>
                  <div className={`font-mono text-[10px] tracking-[0.08em] uppercase ${(ASSET_TYPE_TAG_CLASS[r.assetType] ?? "text-muted").split(" ")[0]}`}>
                    {r.assetType}
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
                  <div className="text-[12.5px] tabular-nums text-muted">
                    {formatVolume(r.volume)}
                  </div>
                  <div className="text-[12.5px] tabular-nums text-primary">{formatMarketCap(r.marketCap)}</div>
                  <div className="text-[12.5px] tabular-nums text-muted">{r.pe === null ? "—" : `${r.pe.toFixed(1)}00d7`}</div>
                  <div className="text-[12.5px] tabular-nums text-muted">
                    {r.dividendYield === null ? "—" : `${r.dividendYield.toFixed(2)}%`}
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
