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
    <div ref={containerRef} className="relative">
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
        className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none uppercase placeholder:normal-case"
      />

      {open && query.trim() && !selected && (
        <div className="absolute top-full left-0 z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-lg">
          {results.length === 0 ? (
            <div className="px-3.5 py-2 text-[12.5px] text-dim">No matching tracked symbols.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.symbol}
                type="button"
                onClick={() => pick(r)}
                className="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
              >
                <span>
                  <span className="text-primary">{r.symbol}</span>
                  {r.name && <span className="ml-2 text-[12px] text-muted">{r.name}</span>}
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
