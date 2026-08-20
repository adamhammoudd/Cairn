"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SymbolTypeahead } from "@/components/symbol-typeahead";

// The header search. Routes to /ticker/[symbol], which already carries the
// chart, that ticker's news feed and its Cairn analysis on one page -- so a
// search result lands on everything about the symbol, not a tab hunt.
//
// Same type-ahead component as Add Holding / Alerts / Compare: one search
// behaviour everywhere, and a result can only ever be a symbol the market-data
// layer actually tracks.
export function GlobalSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // "/" focuses search from anywhere, unless the user is already typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const editing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editing) return;
      const input = containerRef.current?.querySelector("input:not([type=hidden])") as HTMLInputElement | null;
      if (!input) return;
      e.preventDefault();
      input.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-2 rounded-lg border border-line px-2.75 py-1.75 transition-colors duration-base ease-standard hover:border-[#3A3A3A] ${className}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" strokeWidth="2" className="shrink-0">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <SymbolTypeahead
        // No hidden field: this search isn't inside a form, it navigates.
        name={null}
        clearOnSelect
        placeholder="Search tickers, news"
        onSelect={(r) => router.push(`/ticker/${r.symbol}`)}
        className="min-w-0 flex-1"
        inputClassName="w-full min-w-0 bg-transparent text-[12.5px] text-primary placeholder:text-dim outline-none"
      />
      <span className="hidden rounded border border-line px-1 py-0.5 font-mono text-[10px] text-[#4A4A4A] min-[1080px]:inline">
        /
      </span>
    </div>
  );
}
