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
      className={`flex items-center gap-2 rounded-control border border-line px-3 transition-colors duration-base ease-standard hover:border-line-strong focus-within:border-accent ${className}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-dim)" strokeWidth="2" className="shrink-0">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <SymbolTypeahead
        // No hidden field: this search isn't inside a form, it navigates.
        name={null}
        clearOnSelect
        placeholder="Search tickers, news"
        onSelect={(r) => router.push(`/ticker/${encodeURIComponent(r.symbol)}`)}
        className="min-w-0 flex-1"
        // The padding is on the field, not the box, so the field fills the box:
        // 44px tall on phones, the old 35px (37px box) from 900px up.
        inputClassName="w-full min-w-0 min-h-11 bg-transparent py-2 text-body text-primary placeholder:text-dim outline-none min-[900px]:min-h-0"
        // The box sits at the right of the header; a menu hung from its left
        // edge ran ~100px off a 360px phone screen.
        menuAlign="right"
      />
      <span className="hidden rounded-xs border border-line px-1 py-0.5 font-mono text-eyebrow text-dim min-[1080px]:inline">
        /
      </span>
    </div>
  );
}
