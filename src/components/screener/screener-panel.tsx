"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { deleteSavedScreen, runScreen, saveScreen } from "@/lib/actions/screener";
import {
  ASSET_TYPE_TAG_CLASS,
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
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
    <div>
      <div>
        <div>Markets · Screener</div>
        <h1>Screener</h1>
      </div>

      <div>
        <aside>
          <div>Asset type</div>
          <div>
            {ASSET_TYPES.map((t) => {
              const active = filters.assetTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleAssetType(t)}

 >
                  {t}
                </button>
              );
            })}
          </div>

          <FieldLabel>Price</FieldLabel>
          <div>
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minPrice: numOrNull(e.target.value) }))}

 />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: numOrNull(e.target.value) }))}

 />
          </div>

          <FieldLabel>% change</FieldLabel>
          <div>
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minChangePct: numOrNull(e.target.value) }))}

 />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxChangePct: numOrNull(e.target.value) }))}

 />
          </div>

          <FieldLabel>Min volume</FieldLabel>
          <input
            placeholder="e.g. 1000000"
            onChange={(e) => setFilters((f) => ({ ...f, minVolume: numOrNull(e.target.value) }))}

 />

          <FieldLabel>Market cap ($M)</FieldLabel>
          <div>
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minMarketCapM: numOrNull(e.target.value) }))}

 />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxMarketCapM: numOrNull(e.target.value) }))}

 />
          </div>

          <FieldLabel>P/E ratio</FieldLabel>
          <div>
            <input
              placeholder="Min"
              onChange={(e) => setFilters((f) => ({ ...f, minPe: numOrNull(e.target.value) }))}

 />
            <input
              placeholder="Max"
              onChange={(e) => setFilters((f) => ({ ...f, maxPe: numOrNull(e.target.value) }))}

 />
          </div>

          <FieldLabel>Min dividend yield (%)</FieldLabel>
          <input
            placeholder="e.g. 1.5"
            onChange={(e) => setFilters((f) => ({ ...f, minDividendYield: numOrNull(e.target.value) }))}

 />

          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}

 >
            Reset filters
          </button>

          <div>Saved screens</div>
          {savedScreens.length === 0 ? (
            <p>None saved yet.</p>
          ) : (
            <div>
              {savedScreens.map((s) => (
                <div key={s.id}>
                  <button
                    type="button"
                    onClick={() => setFilters(s.filters)}

 >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}

 >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <p>
            Market cap, P/E, and dividend yield are derived from SEC XBRL filings against the latest
            close. Funds and ETFs don&apos;t file those concepts, so they&apos;re excluded by those
            filters.
          </p>
        </aside>

        <div>
          <div>
            <span>
              {loading ? "Filtering…" : `${rows.length} match${rows.length === 1 ? "" : "es"}`}
            </span>
            <div>
              <span>Market cap derived at query time</span>
              <button
                type="button"
                onClick={handleSave}

 >
                Save screen
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div>
              <div>No asset clears every filter</div>
              <p>
                Loosen one constraint at a time — price and change are usually the binding pair.
              </p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}

 >
                Reset filters
              </button>
            </div>
          ) : (
            <>
              <div>
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

 >
                  <div>{r.symbol}</div>
                  <div>
                    {r.assetType}
                  </div>
                  <div>
                    {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </div>
                  <div

 >
                    {r.changePct === null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                  </div>
                  <div>
                    {r.volume === null ? "—" : r.volume.toLocaleString()}
                  </div>
                  <div>{formatMarketCap(r.marketCap)}</div>
                  <div>{r.pe === null ? "—" : r.pe.toFixed(1)}</div>
                  <div>
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
