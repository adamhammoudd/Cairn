"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { NAV_ITEMS, isNavGroup, type NavGroup } from "@/lib/nav-items";
import { signOut } from "@/lib/actions/auth";

interface TopNavProps {
  displayName: string;
  plan: "free" | "premium";
}

function isRouteActive(pathname: string, route: string) {
  return route === "/" ? pathname === "/" : pathname.startsWith(route);
}

function groupHasActiveRoute(pathname: string, group: NavGroup) {
  return group.items.some((item) => isRouteActive(pathname, item.route));
}

export function TopNav({ displayName, plan }: TopNavProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const activeGroup = NAV_ITEMS.find((entry) => isNavGroup(entry) && groupHasActiveRoute(pathname, entry)) as
    | NavGroup
    | undefined;

  return (
    <header ref={navRef} className="sticky top-0 z-30 shrink-0 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="flex h-16 items-center gap-8 px-7">
        <Link href="/" className="shrink-0">
          <Logo size={26} />
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1">
          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <Link
                  key={entry.route}
                  href={entry.route}
                  className={`rounded-lg px-3.5 py-2 text-[13.5px] transition-colors duration-fast ease-standard ${
                    isActive ? "text-primary" : "text-muted hover:text-primary"
                  }`}
                >
                  {entry.label}
                </Link>
              );
            }

            const hasActive = groupHasActiveRoute(pathname, entry);
            const isOpen = openGroup === entry.label;

            return (
              <div key={entry.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup((prev) => (prev === entry.label ? null : entry.label))}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] transition-colors duration-fast ease-standard ${
                    hasActive || isOpen ? "text-primary" : "text-muted hover:text-primary"
                  }`}
                >
                  {entry.label}
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`shrink-0 transition-transform duration-fast ease-standard ${isOpen ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-48 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl">
                    {entry.items.map((item) => {
                      const isActive = isRouteActive(pathname, item.route);
                      return (
                        <Link
                          key={item.route}
                          href={item.route}
                          onClick={() => setOpenGroup(null)}
                          className={`block px-3.5 py-2 text-[13.5px] transition-colors duration-fast ease-standard ${
                            isActive ? "bg-active text-primary" : "text-muted hover:bg-active hover:text-primary"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden w-[240px] items-center gap-2 rounded-lg border border-line bg-transparent px-3.5 py-2 sm:flex">
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

          {plan === "free" && (
            <Link
              href="/billing"
              className="hidden rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-3.5 py-2 text-[13px] font-medium text-canvas transition-opacity duration-fast ease-standard hover:opacity-90 md:block"
            >
              Upgrade
            </Link>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors duration-fast ease-standard hover:bg-active"
            >
              <div
                className="h-[30px] w-[30px] shrink-0 rounded-full"
                style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
              />
              <div className="hidden min-w-0 flex-col items-start overflow-hidden lg:flex">
                <span className="max-w-[120px] truncate text-[13px] leading-tight text-primary">{displayName}</span>
                <span className="text-[11px] leading-tight text-muted capitalize">{plan} plan</span>
              </div>
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={`hidden shrink-0 text-muted transition-transform duration-fast ease-standard lg:block ${accountOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {accountOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-44 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl">
                <Link
                  href="/settings"
                  onClick={() => setAccountOpen(false)}
                  className="block px-3.5 py-2 text-sm text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                >
                  Settings
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="block w-full px-3.5 py-2 text-left text-sm text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeGroup && (
        <div className="flex h-10 items-center gap-1 border-t border-line px-7">
          {activeGroup.items.map((item) => {
            const isActive = isRouteActive(pathname, item.route);
            return (
              <Link
                key={item.route}
                href={item.route}
                className={`rounded-md px-3 py-1.5 text-[12.5px] transition-colors duration-fast ease-standard ${
                  isActive ? "bg-active text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
