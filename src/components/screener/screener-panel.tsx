"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { deleteSavedScreen, runScreen, saveScreen } from "@/lib/actions/screener";
import {
  ASSET_TYPE_LABEL,
  ASSET_TYPE_TAG_CLASS,
  ASSET_TYPES,
  EMPTY_FILTERS,
  PRESET_SCREENS,
  applyScreenSort,
  formatMarketCap,
  formatVolume,
  type ScreenSort,
  type SavedScreen,
  type ScreenerFilters,
  type ScreenerRow,
} from "@/lib/screener";
import { DataFreshness } from "@/components/data-freshness";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatChange, formatMoney } from "@/lib/display-prefs";

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
  // Settings > Display: same currency and percent-vs-dollar treatment the
  // Markets, Watchlists and Holdings tables use.
  const prefs = useDisplayPrefs();
  const [filters, setFilters] = useState<ScreenerFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<ScreenerRow[]>(initialRows);
  // A preset is a filter set plus an ordering. The filters go to the server
  // like any other; the ordering is applied here over the full matching set,
  // so it is an exact sort rather than a server-side top-N.
  const [preset, setPreset] = useState<string | null>(null);
  const [sort, setSort] = useState<ScreenSort | null>(null);
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>(initialSavedScreens);
  const [loading, setLoading] = useState(false);
  const [, startMutate] = useTransition();
  // Newest bar behind any row currently on screen.
  const visibleRows = sort ? applyScreenSort(rows, sort) : rows;
  const asOf = visibleRows.reduce<string | null>((newest, r) => (r.asOf && (!newest || r.asOf > newest) ? r.asOf : newest), null);
  const activePreset = PRESET_SCREENS.find((p) => p.id === preset) ?? null;

  function applyPreset(id: string) {
    const found = PRESET_SCREENS.find((p) => p.id === id);
    if (!found) return;
    setPreset(id);
    setSort(found.sort);
    setFilters(found.filters);
  }

  /**
   * Patch one filter field. Editing any field leaves the active preset: its
   * ordering and, for the 52-week screens, its proximity cut are part of the
   * preset, and keeping either after the banner disappeared would mean rows
   * being dropped with nothing on screen saying so.
   */
  function patchFilters(patch: Partial<ScreenerFilters>) {
    setPreset(null);
    setSort(null);
    setFilters((f) => ({ ...f, ...patch }));
  }

  function clearPreset() {
    setPreset(null);
    setSort(null);
    setFilters(EMPTY_FILTERS);
  }

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
    setPreset(null);
    setSort(null);
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
              onChange={(e) => patchFilters({ minPrice: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => patchFilters({ maxPrice: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>% change</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => patchFilters({ minChangePct: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => patchFilters({ maxChangePct: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>Min volume</FieldLabel>
          <input
            placeholder="e.g. 1000000"
            onChange={(e) => patchFilters({ minVolume: numOrNull(e.target.value) })}
            className={NUM_INPUT_CLASS}
          />

          <FieldLabel>Market cap ($M)</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => patchFilters({ minMarketCapM: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => patchFilters({ maxMarketCapM: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>P/E ratio</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              placeholder="Min"
              onChange={(e) => patchFilters({ minPe: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
            <input
              placeholder="Max"
              onChange={(e) => patchFilters({ maxPe: numOrNull(e.target.value) })}
              className={NUM_INPUT_CLASS}
            />
          </div>

          <FieldLabel>Min dividend yield (%)</FieldLabel>
          <input
            placeholder="e.g. 1.5"
            onChange={(e) => patchFilters({ minDividendYield: numOrNull(e.target.value) })}
            className={NUM_INPUT_CLASS}
          />

          <button
            type="button"
            onClick={clearPreset}
            className="mt-4 w-full rounded-[10px] border border-line bg-transparent py-2.25 text-[12px] text-muted transition-colors duration-fast ease-standard hover:border-[#3A3A3A] hover:text-primary"
          >
            Reset filters
          </button>

          <div className="mt-4.5 mb-2.25 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">Pre-built screens</div>
          <div className="flex flex-col gap-1">
            {PRESET_SCREENS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => applyPreset(p.id)}
                className={`truncate rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors duration-fast ease-standard hover:bg-active hover:text-primary ${
                  preset === p.id ? "bg-active text-primary" : "text-muted"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

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
              {loading ? "Filtering…" : `${visibleRows.length} match${visibleRows.length === 1 ? "" : "es"}`}
            </span>
            <div className="flex items-center gap-3">
              {/* Same numbers as Markets and the ticker page, so the same
                  freshness statement. */}
              <DataFreshness source="last_close" asOf={asOf} className="hidden sm:inline" />
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

          {activePreset && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-active px-4.5 py-2.5">
              <span className="text-[12.5px] text-primary">{activePreset.name}</span>
              {/* A preset that does not say what it selected is an opaque list.
                  This is the same method text the deck on Markets prints. */}
              <span className="max-w-[62ch] text-[11.5px] text-dim text-pretty">{activePreset.method}</span>
            </div>
          )}

          {visibleRows.length === 0 ? (
            <div className="px-6 py-15 text-center">
              <div className="font-serif text-[20px] text-primary">No asset clears every filter</div>
              <p className="mx-auto mt-2 mb-4.5 max-w-[380px] text-[13px] text-muted text-pretty">
                Loosen one constraint at a time - price and change are usually the binding pair.
              </p>
              <button
                type="button"
                onClick={clearPreset}
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
              {visibleRows.map((r, index) => (
                <Link
                  key={r.symbol}
                  href={`/ticker/${r.symbol}`}
                  className="cn-row animate-rise-in grid grid-cols-[1fr_0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_0.7fr_0.8fr] items-center gap-2.5 border-b border-line px-4.5 py-3 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
                  style={{ animationDelay: `${index * 25}ms` }}
                >
                  <div className="text-sm text-primary">{r.symbol}</div>
                  <div className={`font-mono text-[10px] tracking-[0.08em] uppercase ${(ASSET_TYPE_TAG_CLASS[r.assetType] ?? "text-muted").split(" ")[0]}`}>
                    {r.assetType}
                  </div>
                  <div className="text-[12.5px] tabular-nums text-primary">
                    {formatMoney(r.price, prefs)}
                  </div>
                  <div
                    className={`text-[12.5px] tabular-nums ${
                      r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                    }`}
                  >
                    {formatChange(absoluteChangeFrom(r.price, r.changePct), r.changePct, prefs)}
                  </div>
                  <div className="text-[12.5px] tabular-nums text-muted">
                    {formatVolume(r.volume)}
                  </div>
                  <div className="text-[12.5px] tabular-nums text-primary">{formatMarketCap(r.marketCap)}</div>
                  <div className="text-[12.5px] tabular-nums text-muted">{r.pe === null ? "-" : `${r.pe.toFixed(1)}\u00d7`}</div>
                  <div className="text-[12.5px] tabular-nums text-muted">
                    {r.dividendYield === null ? "-" : `${r.dividendYield.toFixed(2)}%`}
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
