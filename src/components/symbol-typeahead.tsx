"use client";

import { useEffect, useRef, useState } from "react";
import { searchSymbols, type SymbolSearchResult } from "@/lib/actions/symbols";

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
// Shared by Add Holding, Alerts, Comparison and the global header search --
// one search behaviour and one result treatment everywhere a ticker is picked.
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) return; // query was just set by a selection, don't re-search
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = await searchSymbols(query);
      if (!cancelled) setResults(next);
    }, 200);
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
    setOpen(false);
    onSelect(result);
  }

  const visible = exclude?.length ? results.filter((r) => !exclude.includes(r.symbol)) : results;

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
          // is a real market-data row rather than the typed text.
          if (e.key === "Enter" && open && visible.length === 1 && !selected) {
            e.preventDefault();
            pick(visible[0]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />

      {open && query.trim() && !selected && (
        <div className="animate-menu-in absolute top-full left-0 z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-lg">
          {visible.length === 0 ? (
            <div className="px-3.5 py-2 text-[12.5px] text-dim">No matching tracked symbols.</div>
          ) : (
            visible.map((r) => (
              <button
                key={r.symbol}
                type="button"
                onClick={() => pick(r)}
                className="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
              >
                <span>
                  <span className="text-primary">{highlightMatch(r.symbol, query)}</span>
                  {r.name && <span className="ml-2 text-[12px] text-muted">{highlightMatch(r.name, query)}</span>}
                </span>
                <span className="text-[11px] text-dim capitalize">{r.assetType}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
