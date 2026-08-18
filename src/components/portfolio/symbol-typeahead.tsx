"use client";

import { useEffect, useRef, useState } from "react";
import { searchSymbols, type SymbolSearchResult } from "@/lib/actions/symbols";

interface SymbolTypeaheadProps {
  onSelect: (result: SymbolSearchResult) => void;
}

// Selection-only, by design -- the hidden `symbol` input (what the form
// actually submits) is set exclusively on picking a result, never from
// free-typed text. That's the data-integrity fix: a mistyped or ambiguous
// ticker can't reach the holdings table because there's no path from typing
// to a submitted value that doesn't go through a real market-data-layer row.
// Highlights the first occurrence of `query` within `text`, case-insensitive.
// Matched substring instantly bolded/accented -- no per-item animation (per motion spec).
function highlightMatch(text: string, query: string) {
  const i = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (i === -1 || !query.trim()) return text;
  return (
    <>
      {text.slice(0, i)}
      <span>{text.slice(i, i + query.trim().length)}</span>
      {text.slice(i + query.trim().length)}
    </>
  );
}

export function SymbolTypeahead({ onSelect }: SymbolTypeaheadProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SymbolSearchResult | null>(null);
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
    setSelected(result);
    setQuery(result.name ? `${result.symbol} — ${result.name}` : result.symbol);
    setOpen(false);
    onSelect(result);
  }

  return (
    <div ref={containerRef}>
      <input type="hidden" name="symbol" value={selected?.symbol ?? ""} required />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search ticker or name…"
        autoComplete="off"

 />

      {open && query.trim() && !selected && (
        <div>
          {results.length === 0 ? (
            <div>No matching tracked symbols.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.symbol}
                type="button"
                onClick={() => pick(r)}

 >
                <span>
                  <span>{highlightMatch(r.symbol, query)}</span>
                  {r.name && <span>{highlightMatch(r.name, query)}</span>}
                </span>
                <span>{r.assetType}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
