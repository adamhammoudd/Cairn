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

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const ACCOUNT_MENU = [
  { label: "Settings", href: "/settings" },
  { label: "Billing", href: "/billing" },
  { label: "First-run walkthrough", href: "/onboarding" },
];

export function TopNav({ displayName, plan }: TopNavProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setOpenGroup(null);
    setAccountOpen(false);
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || !searchRef.current) return;
      const target = e.target as HTMLElement | null;
      const editing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editing) return;
      e.preventDefault();
      searchRef.current.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header ref={navRef} className="sticky top-0 z-30 shrink-0 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-15 max-w-[1560px] items-center gap-6 px-5 sm:px-7">
        <Link href="/" className="shrink-0">
          <Logo size={24} />
        </Link>

        <button
          type="button"
          onClick={() => setMobileNavOpen((prev) => !prev)}
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}
          className="flex h-8 w-8.5 shrink-0 flex-col justify-center gap-1 rounded-lg border border-line bg-transparent px-1.5 transition-colors duration-fast ease-standard hover:border-[#3A3A3A] min-[900px]:hidden"
        >
          <span className="block h-px rounded-full bg-primary" />
          <span className="block h-px rounded-full bg-primary" />
          <span className="block h-px rounded-full bg-muted" />
        </button>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-hidden min-[900px]:flex">
          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <div key={entry.route} className="relative">
                  <Link
                    href={entry.route}
                    className={`flex items-center rounded-lg px-2.5 py-1.5 text-[13.5px] whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
                      isActive ? "text-primary" : "text-muted"
                    }`}
                  >
                    {entry.label}
                  </Link>
                  <span
                    className={`absolute right-2.5 bottom-[-12px] left-2.5 h-[1.5px] origin-left scale-x-0 rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-transform duration-base ease-standard ${
                      isActive ? "scale-x-100" : ""
                    }`}
                  />
                </div>
              );
            }

            const hasActive = groupHasActiveRoute(pathname, entry);
            const isOpen = openGroup === entry.label;

            return (
              <div
                key={entry.label}
                className="relative"
                onMouseEnter={() => setOpenGroup(entry.label)}
                onMouseLeave={() => setOpenGroup((prev) => (prev === entry.label ? null : prev))}
              >
                <button
                  type="button"
                  onClick={() => setOpenGroup((prev) => (prev === entry.label ? null : entry.label))}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
                    hasActive || isOpen ? "text-primary" : "text-muted"
                  }`}
                >
                  {entry.label}
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className={`shrink-0 transition-transform duration-base ease-standard ${isOpen ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <span
                  className={`absolute right-2.5 bottom-[-12px] left-2.5 h-[1.5px] origin-left scale-x-0 rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-transform duration-base ease-standard ${
                    hasActive ? "scale-x-100" : ""
                  }`}
                />

                {isOpen && (
                  <div className="animate-menu-in absolute top-[calc(100%+10px)] left-0 min-w-52 rounded-xl border border-line bg-panel p-1.5 shadow-2xl">
                    {entry.items.map((item) => {
                      const isActive = isRouteActive(pathname, item.route);
                      return (
                        <Link
                          key={item.route}
                          href={item.route}
                          onClick={() => setOpenGroup(null)}
                          className={`block rounded-lg px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors duration-fast ease-standard ${
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

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="hidden w-[180px] items-center gap-2 rounded-lg border border-line bg-transparent px-2.5 py-1.5 transition-colors duration-base ease-standard hover:border-[#3A3A3A] min-[1080px]:flex min-[1300px]:w-[230px]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" strokeWidth="2" className="shrink-0">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search tickers, news"
              className="w-full min-w-0 bg-transparent text-[12.5px] text-primary placeholder:text-dim outline-none"
            />
            <span className="rounded border border-line px-1 py-0.5 font-mono text-[10px] text-[#4A4A4A]">/</span>
          </div>

          <button
            type="button"
            aria-label="Search"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-transparent transition-colors duration-base ease-standard hover:border-[#3A3A3A] min-[900px]:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {plan === "free" && (
            <Link
              href="/billing"
              className="hidden rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_22px_rgba(47,198,133,0.35)] min-[1240px]:block"
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold text-canvas"
                style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
              >
                {initialsOf(displayName)}
              </div>
              <div className="hidden min-w-0 flex-col items-start overflow-hidden min-[1000px]:flex">
                <span className="max-w-[120px] truncate text-[12.5px] leading-tight text-primary">{displayName}</span>
                <span className="text-[10.5px] leading-tight text-muted capitalize">{plan} plan</span>
              </div>
            </button>

            {accountOpen && (
              <div className="animate-menu-in absolute top-[calc(100%+10px)] right-0 min-w-50 rounded-xl border border-line bg-panel p-1.5 shadow-2xl">
                {ACCOUNT_MENU.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAccountOpen(false)}
                    className="block rounded-lg px-2.5 py-2 text-[13px] whitespace-nowrap text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
                <form action={signOut}>
                  <button
                    type="submit"
                    className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <div className="animate-menu-in border-t border-line bg-[#0C0C0C] px-3.5 py-2.5 pb-4 min-[900px]:hidden">
          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <Link
                  key={entry.route}
                  href={entry.route}
                  className={`block rounded-lg px-2 py-2.5 text-[13.5px] transition-colors duration-fast ease-standard ${
                    isActive ? "text-primary" : "text-muted"
                  }`}
                >
                  {entry.label}
                </Link>
              );
            }
            return (
              <div key={entry.label}>
                <div className="px-2 pt-3.5 pb-1 font-mono text-[10px] tracking-[0.14em] text-dim uppercase">
                  {entry.label}
                </div>
                {entry.items.map((item) => {
                  const isActive = isRouteActive(pathname, item.route);
                  return (
                    <Link
                      key={item.route}
                      href={item.route}
                      className={`block rounded-lg px-2 py-2.5 text-[13.5px] transition-colors duration-fast ease-standard ${
                        isActive ? "text-primary" : "text-muted"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}
