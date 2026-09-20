"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { deleteSavedScreen, saveScreen } from "@/lib/actions/screener";
import {
  ASSET_TYPE_LABEL,
  ASSET_TYPES,
  EMPTY_FILTERS,
  PRESET_SCREENS,
  SCREENER_NUMERIC_FIELDS,
  applyScreenSort,
  applyScreenerFilters,
  assetTypeBadge,
  formatMarketCap,
  formatVolume,
  type ScreenSort,
  type SavedScreen,
  type ScreenerFilters,
  type ScreenerRow,
} from "@/lib/screener";
import { DataFreshness } from "@/components/data-freshness";
import { Sparkline } from "@/components/sparkline";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { PromptDialog } from "@/components/dialog";
import { absoluteChangeFrom, formatChange, formatMoney, currencySymbol } from "@/lib/display-prefs";

type NumericField = (typeof SCREENER_NUMERIC_FIELDS)[number];
type FilterText = Record<NumericField, string>;

function numOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

type ColKey = "symbol" | "type" | "price" | "changePct" | "volume" | "marketCap" | "pe" | "dividendYield";

// One grid for the header and every row, so the columns cannot drift apart.
const GRID =
  "grid grid-cols-[minmax(0,1.4fr)_90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_72px_72px_86px] items-center gap-3";

const COLUMNS: { key: ColKey | "trend"; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "type", label: "Type" },
  { key: "price", label: "Price" },
  { key: "changePct", label: "24h" },
  { key: "volume", label: "Volume" },
  { key: "marketCap", label: "Mkt cap" },
  { key: "pe", label: "P/E" },
  { key: "dividendYield", label: "Yield" },
  { key: "trend", label: "Trend" },
];

// Type tints from the design: each asset type owns a hue, so a column of mixed
// symbols reads at a glance. Index stays neutral - red is reserved for loss.
const TYPE_TINT: Record<string, string> = {
  equity: "border-info/30 bg-info/10 text-info",
  etf: "border-accent/30 bg-accent/10 text-accent",
  crypto: "border-violet/30 bg-violet/10 text-violet",
  forex: "border-warning/30 bg-warning/10 text-warning",
  index: "border-line bg-raised text-muted",
  future: "border-line bg-raised text-muted",
};
const tint = (t: string) => TYPE_TINT[t] ?? "border-line bg-raised text-muted";

/** Order rows by one column. Rows missing the figure sort last either way. */
function sortByColumn(rows: ScreenerRow[], key: ColKey, dir: "asc" | "desc"): ScreenerRow[] {
  const val = (r: ScreenerRow): number | string | null => {
    switch (key) {
      case "symbol": return r.symbol;
      case "type": return r.assetType;
      case "price": return r.price;
      case "changePct": return r.changePct;
      case "volume": return r.volume;
      case "marketCap": return r.marketCap;
      case "pe": return r.pe;
      case "dividendYield": return r.dividendYield;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * sign;
    return (av - bv) * sign;
  });
}

/** The text each filter box should show for a given filter set. */
function textFromFilters(f: ScreenerFilters): FilterText {
  return Object.fromEntries(
    SCREENER_NUMERIC_FIELDS.map((k) => [k, f[k] === null ? "" : String(f[k])]),
  ) as FilterText;
}

interface ScreenerPanelProps {
  initialRows: ScreenerRow[];
  savedScreens: SavedScreen[];
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 mb-2 font-mono text-eyebrow tracking-[0.16em] text-dim uppercase first:mt-0">{children}</div>;
}

const NUM_INPUT_CLASS =
  "w-full rounded-[9px] border border-line bg-[#0c0c0c] px-2.5 py-2.5 font-mono text-[11.5px] text-primary outline-none transition-colors duration-fast ease-standard placeholder:text-dim focus:border-accent";

function FilterInput({
  field,
  placeholder,
  text,
  onEdit,
}: {
  field: NumericField;
  placeholder: string;
  text: FilterText;
  onEdit: (field: NumericField, raw: string) => void;
}) {
  return (
    <input
      inputMode="decimal"
      placeholder={placeholder}
      value={text[field]}
      onChange={(e) => onEdit(field, e.target.value)}
      className={NUM_INPUT_CLASS}
    />
  );
}

export function ScreenerPanel({ initialRows, savedScreens: initialSavedScreens }: ScreenerPanelProps) {
  // Settings > Display: same currency and percent-vs-dollar treatment the
  // Markets, Watchlists and Holdings tables use.
  const prefs = useDisplayPrefs();
  const [filters, setFilters] = useState<ScreenerFilters>(EMPTY_FILTERS);
  // Text mirror for the filter boxes, so a preset / reset / saved-screen load
  // visibly updates every box to match what is actually filtering, and so a
  // half-typed value ("-", "1.") is not clobbered on the way in.
  const [filterText, setFilterText] = useState<FilterText>(() => textFromFilters(EMPTY_FILTERS));
  // A preset is a filter set plus an ordering. Both are applied client-side
  // over the full universe already in the browser (`initialRows`), so a
  // keystroke re-filters instantly with no database round trip.
  const [preset, setPreset] = useState<string | null>(null);
  const [sort, setSort] = useState<ScreenSort | null>(null);
  // A header click orders by that column; it wins over a preset's ordering.
  const [colSort, setColSort] = useState<{ key: ColKey; dir: "asc" | "desc" } | null>(null);
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>(initialSavedScreens);
  const [namingScreen, setNamingScreen] = useState(false);
  const [, startMutate] = useTransition();

  const matched = useMemo(() => applyScreenerFilters(initialRows, filters), [initialRows, filters]);
  // Newest bar behind any row currently on screen.
  const presetRows = sort ? applyScreenSort(matched, sort) : matched;
  const visibleRows = colSort ? sortByColumn(presetRows, colSort.key, colSort.dir) : presetRows;

  function clickColumn(key: ColKey) {
    setColSort((c) => (c?.key === key ? { key, dir: c.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "symbol" || key === "type" ? "asc" : "desc" }));
  }

  /** Set the whole filter set at once (preset, reset, saved screen) and sync the boxes. */
  function setFilterSet(next: ScreenerFilters) {
    setFilters(next);
    setFilterText(textFromFilters(next));
  }
  const asOf = visibleRows.reduce<string | null>((newest, r) => (r.asOf && (!newest || r.asOf > newest) ? r.asOf : newest), null);
  const activePreset = PRESET_SCREENS.find((p) => p.id === preset) ?? null;

  function applyPreset(id: string) {
    const found = PRESET_SCREENS.find((p) => p.id === id);
    if (!found) return;
    setPreset(id);
    setColSort(null);
    setSort(found.sort);
    setFilterSet(found.filters);
  }

  /**
   * Patch one filter field. Editing any field leaves the active preset: its
   * ordering and, for the 52-week screens, its proximity cut are part of the
   * preset, and keeping either after the banner disappeared would mean rows
   * being dropped with nothing on screen saying so.
   */
  /** Type into one numeric filter box: mirror the raw text, filter on the parsed value. */
  function editFilter(field: NumericField, raw: string) {
    setPreset(null);
    setSort(null);
    setFilterText((t) => ({ ...t, [field]: raw }));
    setFilters((f) => ({ ...f, [field]: numOrNull(raw) }));
  }

  function clearPreset() {
    setPreset(null);
    setSort(null);
    setColSort(null);
    setFilterSet(EMPTY_FILTERS);
  }

  function toggleAssetType(t: string) {
    setPreset(null);
    setSort(null);
    setFilters((f) => ({
      ...f,
      assetTypes: f.assetTypes.includes(t) ? f.assetTypes.filter((x) => x !== t) : [...f.assetTypes, t],
    }));
  }

  function handleSave() {
    setNamingScreen(true);
  }

  function submitScreenName(name: string) {
    setNamingScreen(false);
    startMutate(async () => {
      await saveScreen(name, filters);
      setSavedScreens((prev) => [...prev, { id: crypto.randomUUID(), name, filters }]);
    });
  }

  function handleDelete(id: string) {
    startMutate(() => deleteSavedScreen(id));
    setSavedScreens((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="animate-page-in mx-auto max-w-[1320px]">
      <div className="mb-5.5 flex flex-wrap items-end justify-between gap-4.5">
        <div>
          <div className="font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Markets · Screener</div>
          <h1 className="mt-2 font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">Screener</h1>
          <p className="mt-2 max-w-[520px] text-lead text-muted text-pretty">
            Stack filters on the left; the board narrows as you go. Save a screen to pin it to your Base Camp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-[9px] border border-line px-3 py-2">
            <span aria-hidden className="animate-breathe h-1.5 w-1.5 rounded-full bg-accent" />
            <DataFreshness source="last_close" asOf={asOf} />
          </span>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-[9px] bg-accent px-3.5 py-2 text-[12.5px] font-bold text-canvas transition-[background-color,transform] duration-base ease-standard hover:-translate-y-px hover:bg-accent-light"
          >
            Save screen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[232px_1fr]">
        <aside className="rounded-2xl border border-[#232323] bg-panel p-4.5 min-[900px]:sticky min-[900px]:top-[78px]">
          <div className="font-mono text-eyebrow tracking-[0.16em] text-dim uppercase">Asset type</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ASSET_TYPES.map((t) => {
              const active = filters.assetTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleAssetType(t)}
                  className={`rounded-full border px-3 py-[7px] text-caption transition-colors duration-fast ease-standard hover:border-line-strong ${
                    active ? "border-accent/50 bg-accent/10 text-accent-light" : "border-line bg-[#0c0c0c] text-muted"
                  }`}
                >
                  {ASSET_TYPE_LABEL[t] ?? t}
                </button>
              );
            })}
          </div>

          <FieldLabel>Price</FieldLabel>
          <div className="flex items-center gap-2">
            <FilterInput field="minPrice" placeholder="Min" text={filterText} onEdit={editFilter} />
            <FilterInput field="maxPrice" placeholder="Max" text={filterText} onEdit={editFilter} />
          </div>

          <FieldLabel>% change</FieldLabel>
          <div className="flex items-center gap-2">
            <FilterInput field="minChangePct" placeholder="Min" text={filterText} onEdit={editFilter} />
            <FilterInput field="maxChangePct" placeholder="Max" text={filterText} onEdit={editFilter} />
          </div>

          <FieldLabel>Min volume</FieldLabel>
          <FilterInput field="minVolume" placeholder="e.g. 1000000" text={filterText} onEdit={editFilter} />

          <FieldLabel>Market cap ({currencySymbol(prefs)}M)</FieldLabel>
          <div className="flex items-center gap-2">
            <FilterInput field="minMarketCapM" placeholder="Min" text={filterText} onEdit={editFilter} />
            <FilterInput field="maxMarketCapM" placeholder="Max" text={filterText} onEdit={editFilter} />
          </div>

          <FieldLabel>P/E ratio</FieldLabel>
          <div className="flex items-center gap-2">
            <FilterInput field="minPe" placeholder="Min" text={filterText} onEdit={editFilter} />
            <FilterInput field="maxPe" placeholder="Max" text={filterText} onEdit={editFilter} />
          </div>

          <FieldLabel>Min dividend yield (%)</FieldLabel>
          <FilterInput field="minDividendYield" placeholder="e.g. 1.5" text={filterText} onEdit={editFilter} />

          <button
            type="button"
            onClick={clearPreset}
            className="mt-4 w-full rounded-[10px] border border-line bg-transparent py-2.5 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:border-line-strong hover:bg-raised"
          >
            Reset filters
          </button>

          <div className="mt-4.5 mb-2 font-mono text-eyebrow tracking-[0.16em] text-violet uppercase">Pre-built screens</div>
          <div className="flex flex-col gap-1.5">
            {PRESET_SCREENS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => applyPreset(p.id)}
                className={`flex flex-col gap-0.5 rounded-panel border px-3 py-2.5 text-left text-primary transition-colors duration-base ease-standard hover:border-violet hover:bg-violet/10 ${
                  preset === p.id ? "border-violet bg-violet/10" : "border-violet/20 bg-violet/5"
                }`}
              >
                <span className="text-[12.5px]">{p.name}</span>
                <span className="font-mono text-[10.5px] text-dim">{p.hint}</span>
              </button>
            ))}
          </div>

          <div className="mt-4.5 mb-2 font-mono text-eyebrow tracking-[0.16em] text-dim uppercase">Saved screens</div>
          {savedScreens.length === 0 ? (
            <div className="rounded-control border border-dashed border-line px-3 py-2.5">
              <p className="text-body text-muted">No saved screens</p>
              <p className="mt-0.5 text-micro text-dim text-pretty">
                Adjust the filters, then <span className="text-muted">Save screen</span> to pin one here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {savedScreens.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreset(null);
                      setSort(null);
                      setFilterSet(s.filters);
                    }}
                    className="flex-1 truncate rounded-control px-2.5 py-2 text-left text-body text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="text-caption text-dim transition-colors duration-fast ease-standard hover:text-negative"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4.5 text-caption leading-relaxed text-dim">
            Market cap, P/E, and dividend yield are derived from SEC XBRL filings against the latest
            close. Funds and ETFs don&apos;t file those concepts, so they&apos;re excluded by those
            filters.
          </p>
        </aside>

        <div className="overflow-hidden rounded-2xl border border-[#232323] bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#1c1c1c] bg-[#0c0c0c] px-5 py-3.5">
            <span className="font-mono text-micro tracking-[0.14em] text-primary uppercase">
              <span className="text-accent">{visibleRows.length}</span> {visibleRows.length === 1 ? "match" : "matches"}
            </span>
            <span className="hidden text-caption text-dim sm:inline">Market cap derived at query time</span>
          </div>

          {activePreset && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-active px-4.5 py-2.5">
              <span className="text-body text-primary">{activePreset.name}</span>
              {/* A preset that does not say what it selected is an opaque list.
                  This is the same method text the deck on Markets prints. */}
              <span className="max-w-[62ch] text-caption text-dim text-pretty">{activePreset.method}</span>
            </div>
          )}

          {visibleRows.length === 0 ? (
            <div className="px-6 py-15 text-center">
              <div className="font-serif text-h3 text-primary">No asset clears every filter</div>
              <p className="mx-auto mt-2 mb-4.5 max-w-[380px] text-body text-muted text-pretty">
                Loosen one constraint at a time - price and change are usually the binding pair.
              </p>
              <button
                type="button"
                onClick={clearPreset}
                className="rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-body font-semibold text-canvas"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[940px]">
              <div className={`${GRID} border-b border-[#1c1c1c] bg-[#0c0c0c] px-5 py-3 font-mono text-eyebrow tracking-[0.14em] uppercase`}>
                {COLUMNS.map((c) => {
                  if (c.key === "trend") {
                    return (
                      <div key={c.key} className="text-dim">
                        {c.label}
                      </div>
                    );
                  }
                  const key = c.key;
                  const on = colSort?.key === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => clickColumn(key)}
                      aria-label={`Sort by ${c.label}${on ? (colSort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                      className={`flex items-center p-0 text-left uppercase transition-colors duration-fast ease-standard hover:text-primary ${on ? "text-primary" : "text-dim"}`}
                    >
                      {c.label}
                      <span aria-hidden className={`ml-1.5 ${on ? "text-accent" : "text-transparent"}`}>
                        {on && colSort.dir === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {visibleRows.map((r, index) => (
                <Link
                  key={r.symbol}
                  href={`/ticker/${r.symbol}`}
                  className={`cn-row animate-rise-in ${GRID} border-b border-[#171717] px-5 py-[11px] transition-colors duration-fast ease-standard last:border-b-0 hover:bg-raised`}
                  style={{ animationDelay: `${index * 25}ms` }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-control border font-mono text-eyebrow ${tint(r.assetType)}`}
                    >
                      {r.symbol.slice(0, 2)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="truncate text-body font-semibold text-primary">{r.symbol}</span>
                      {r.name && <span className="truncate text-micro text-dim">{r.name}</span>}
                    </span>
                  </div>
                  <div
                    className={`justify-self-start rounded-full border px-2 py-[3px] font-mono text-[9px] tracking-[0.1em] uppercase ${tint(r.assetType)}`}
                  >
                    {assetTypeBadge(r.assetType)}
                  </div>
                  <div className="font-mono text-[12.5px] tabular-nums text-primary">
                    {formatMoney(r.price, prefs)}
                  </div>
                  <div
                    className={`font-mono text-[12.5px] tabular-nums ${
                      r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-accent" : "text-negative"
                    }`}
                  >
                    {formatChange(absoluteChangeFrom(r.price, r.changePct), r.changePct, prefs)}
                  </div>
                  <div
                    className="font-mono text-[12.5px] tabular-nums text-muted"
                    title={r.volume === null ? "Volume not reported for this asset" : undefined}
                  >
                    {formatVolume(r.volume)}
                  </div>
                  <div
                    className="font-mono text-[12.5px] tabular-nums text-muted"
                    title={r.marketCap === null ? "Market cap not reported - funds and ETFs don't file it" : undefined}
                  >
                    {formatMarketCap(r.marketCap, prefs)}
                  </div>
                  <div className="font-mono text-[12.5px] tabular-nums text-muted">{r.pe === null ? "n/a" : `${r.pe.toFixed(1)}\u00d7`}</div>
                  <div className="font-mono text-[12.5px] tabular-nums text-muted">
                    {r.dividendYield === null ? "n/a" : `${r.dividendYield.toFixed(2)}%`}
                  </div>
                  <Sparkline
                    values={r.trend}
                    positive={r.trend.length > 1 ? r.trend[r.trend.length - 1] >= r.trend[0] : (r.changePct ?? 0) >= 0}
                    className="h-7 w-[86px]"
                    delayMs={150 + index * 35}
                  />
                </Link>
              ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <PromptDialog
        open={namingScreen}
        title="Name this screen"
        description="Saved screens keep the filters currently applied and reappear in the sidebar."
        placeholder="e.g. Large-cap dividend payers"
        confirmLabel="Save screen"
        onSubmit={submitScreenName}
        onCancel={() => setNamingScreen(false)}
      />
    </div>
  );
}
