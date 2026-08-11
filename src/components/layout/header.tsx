"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavGroup } from "@/lib/nav-items";

function findPageTitle(pathname: string): string {
  for (const entry of NAV_ITEMS) {
    const leaves = isNavGroup(entry) ? entry.items : [entry];
    const match = leaves.find((leaf) =>
      leaf.route === "/" ? pathname === "/" : pathname.startsWith(leaf.route)
    );
    if (match) return match.label;
  }
  return "Cairn";
}

export function Header() {
  const pathname = usePathname();
  const pageTitle = findPageTitle(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-line bg-canvas px-7">
      <h1 className="font-serif text-[19px] text-primary">{pageTitle}</h1>

      <div className="flex items-center gap-4">
        <div className="flex w-[280px] items-center gap-2 rounded-lg border border-line bg-transparent px-3.5 py-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8A8A8A"
            strokeWidth="2"
            className="shrink-0"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search tickers, news, holdings…"
            className="w-full bg-transparent text-[13px] text-primary placeholder:text-dim outline-none"
          />
        </div>
      </div>
    </header>
  );
}
