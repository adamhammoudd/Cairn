"use client";

import { useEffect, useRef, useState } from "react";
import { lookupSymbol, searchSymbols, type SymbolSearchResult } from "@/lib/actions/symbols";
import { assetTypeBadge } from "@/lib/screener";

interface SymbolTypeaheadProps {
  onSelect: (result: SymbolSearchResult) => void;
  /**
   * Name of the hidden input carrying the picked symbol into a surrounding
   * <form>. Pass null for callers that handle the selection themselves (global
   * search, comparison) so no stray field is submitted.
   */
  name?: string | null;
  required?: boolean;
  placeholder?: string;
  /** Reset the field after a pick - for pickers that add to a list. */
  clearOnSelect?: boolean;
  /** Symbols already chosen elsewhere; filtered out of the result list. */
  exclude?: string[];
  /** Prefills the box, e.g. when editing an existing alert. */
  initial?: SymbolSearchResult | null;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

// Selection-only, by design -- the hidden `symbol` input (what the form
// actually submits) is set exclusively on picking a result, never from
// free-typed text. That's the data-integrity fix: a mistyped or ambiguous
// ticker can't reach the holdings table because there's no path from typing
// to a submitted value that doesn't go through a real market-data-layer row.
//
// Shared by Add Holding, Alerts, Comparison, Research and the global header
// search -- one search behaviour and one result treatment everywhere a ticker
// is picked.
//
// Two-stage search. Stage one is the local directory, which answers every
// keystroke without leaving the process. Stage two runs only when the typed
// text looks like a ticker and stage one found no exact match: it asks the
// market-data provider directly and ingests the symbol if it exists. That is
// what turns "No matching tracked symbols" -- the message a beta tester got
// for RKLB -- into a result. A symbol the provider genuinely does not carry
// says so, in place, rather than being silently dropped from the list.

// Highlights the first occurrence of `query` within `text`, case-insensitive.
// Matched substring instantly bolded/accented -- no per-item animation (per motion spec).
function highlightMatch(text: string, query: string) {
  const i = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (i === -1 || !query.trim()) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-accent">{text.slice(i, i + query.trim().length)}</span>
      {text.slice(i + query.trim().length)}
    </>
  );
}

function labelFor(result: SymbolSearchResult) {
  return result.name ? `${result.symbol} - ${result.name}` : result.symbol;
}

/** Same shape normalizeSymbol() accepts server-side, so the client never asks
 *  the provider about text that could not be a symbol. */
const TICKER_RE = /^[A-Za-z0-9^][A-Za-z0-9.\-^=]{0,14}$/;

const DEFAULT_INPUT_CLASS =
  "w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none uppercase placeholder:normal-case";

export function SymbolTypeahead({
  onSelect,
  name = "symbol",
  required = true,
  placeholder = "Search ticker or name…",
  clearOnSelect = false,
  exclude,
  initial = null,
  className = "",
  inputClassName = DEFAULT_INPUT_CLASS,
  autoFocus = false,
}: SymbolTypeaheadProps) {
  const [query, setQuery] = useState(initial ? labelFor(initial) : "");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SymbolSearchResult | null>(initial);
  // The on-demand half: what we're checking with the provider, and what came
  // back. Kept separate from `results` so a slow provider never blanks or
  // reorders the local list under the cursor.
  const [probing, setProbing] = useState<string | null>(null);
  const [probed, setProbed] = useState<SymbolSearchResult | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) return; // query was just set by a selection, don't re-search
    const q = query.trim();
    // An empty query is handled by deriving empty state at render (see
    // `hasQuery` below) rather than by clearing three pieces of state here.
    // Setting state synchronously in an effect body cascades an extra render
    // on every keystroke, which is what react-hooks/set-state-in-effect flags.
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = await searchSymbols(q);
      if (cancelled) return;
      setResults(next);

      // Stage two. Only for ticker-shaped input with no exact local hit, and
      // only after the longer debounce, so a provider request needs a
      // deliberate pause in typing rather than every keystroke.
      const upper = q.toUpperCase();
      const exact = next.some((r) => r.symbol === upper);
      if (exact || !TICKER_RE.test(q)) {
        setProbed(null);
        setProbing(null);
        return;
      }
      setProbing(upper);
      setProbed(null);
      const found = await lookupSymbol(q);
      if (cancelled) return;
      setProbing(null);
      setProbed(found);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(result: SymbolSearchResult) {
    if (clearOnSelect) {
      setSelected(null);
      setQuery("");
      setResults([]);
    } else {
      setSelected(result);
      setQuery(labelFor(result));
    }
    setProbed(null);
    setProbing(null);
    setOpen(false);
    onSelect(result);
  }

  // With an empty box there is nothing to show, whatever the last search left
  // in state. Deriving that here keeps the effect above free of setState.
  const hasQuery = query.trim().length > 0;
  const activeResults = hasQuery ? results : [];
  const activeProbed = hasQuery ? probed : null;
  const activeProbing = hasQuery ? probing : null;

  const excluded = new Set(exclude ?? []);
  const visible = excluded.size ? activeResults.filter((r) => !excluded.has(r.symbol)) : activeResults;
  // A freshly-ingested symbol is appended rather than merged into the local
  // list, so its "just fetched" state is visible.
  const newlyAvailable =
    activeProbed?.availability === "available" &&
    !visible.some((r) => r.symbol === activeProbed.symbol) &&
    !excluded.has(activeProbed.symbol)
      ? activeProbed
      : null;
  const unavailable = activeProbed?.availability === "unavailable" ? activeProbed : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={selected?.symbol ?? ""} required={required} />}
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // Enter with exactly one match is the fast path people expect from a
          // ticker box; it still routes through pick(), so what gets committed
          // is a real market-data-layer row rather than the typed text.
          if (e.key === "Enter" && open && !selected) {
            const only = visible.length === 1 && !newlyAvailable ? visible[0] : visible.length === 0 && newlyAvailable ? newlyAvailable : null;
            if (only) {
              e.preventDefault();
              pick(only);
            }
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />

      {open && query.trim() && !selected && (
        // min-w: the header search input is deliberately narrow, and a result
        // row inside a 160px menu had its symbol clipped to nothing by the
        // badge beside it. The menu may be wider than the input it hangs off.
        <div className="animate-menu-in absolute top-full left-0 z-30 mt-1 w-full min-w-[260px] overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-lg">
          {visible.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onClick={() => pick(r)}
              className="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                {/* The ticker never truncates; the name gives way first. */}
                <span className="shrink-0 text-primary">{highlightMatch(r.symbol, query)}</span>
                {r.name && <span className="truncate text-[12px] text-muted">{highlightMatch(r.name, query)}</span>}
              </span>
              <span className="ml-2 shrink-0 text-[11px] text-dim">{assetTypeBadge(r.assetType)}</span>
            </button>
          ))}

          {newlyAvailable && (
            <button
              type="button"
              onClick={() => pick(newlyAvailable)}
              className="flex w-full items-center justify-between border-t border-line px-3.5 py-2 text-left text-[13px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0 text-primary">{highlightMatch(newlyAvailable.symbol, query)}</span>
                {newlyAvailable.name && <span className="truncate text-[12px] text-muted">{newlyAvailable.name}</span>}
              </span>
              <span className="ml-2 shrink-0 rounded-full border border-accent/40 px-1.75 py-0.5 font-mono text-[9px] tracking-[0.1em] text-accent uppercase">
                Just added
              </span>
            </button>
          )}

          {activeProbing && (
            <div className="flex items-center gap-2 px-3.5 py-2 text-[12.5px] text-dim">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Checking for data on {activeProbing}…
            </div>
          )}

          {!activeProbing && unavailable && (
            <div className="border-t border-line px-3.5 py-2 text-[12.5px] text-dim">
              {unavailable.detail ?? `No market data available for ${unavailable.symbol}.`}
            </div>
          )}

          {!activeProbing && !unavailable && visible.length === 0 && !newlyAvailable && (
            <div className="px-3.5 py-2 text-[12.5px] text-dim">
              {TICKER_RE.test(query.trim()) ? "Searching…" : "No symbol or company name matches that."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
