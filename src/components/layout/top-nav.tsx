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
  const [lastPathname, setLastPathname] = useState(pathname);
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Collapse any open menu when the route changes. Adjusted during render
  // rather than in an effect so there's no extra commit with the menu still
  // open on the new page (React's "adjusting state when props change").
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpenGroup(null);
    setAccountOpen(false);
    setMobileNavOpen(false);
  }

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
    <header ref={navRef}>
      <div>
        <Link href="/">
          <Logo size={24} />
        </Link>

        <button
          type="button"
          onClick={() => setMobileNavOpen((prev) => !prev)}
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}

 >
          <span />
          <span />
          <span />
        </button>

        <nav>
          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <div key={entry.route}>
                  <Link
                    href={entry.route}

 >
                    {entry.label}
                  </Link>
                  <span

 />
                </div>
              );
            }

            const hasActive = groupHasActiveRoute(pathname, entry);
            const isOpen = openGroup === entry.label;

            return (
              <div
                key={entry.label}

                onMouseEnter={() => setOpenGroup(entry.label)}
                onMouseLeave={() => setOpenGroup((prev) => (prev === entry.label ? null : prev))}
 >
                <button
                  type="button"
                  onClick={() => setOpenGroup((prev) => (prev === entry.label ? null : entry.label))}

 >
                  {entry.label}
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"

 >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <span

 />

                {isOpen && (
                  <div>
                    {entry.items.map((item) => {
                      const isActive = isRouteActive(pathname, item.route);
                      return (
                        <Link
                          key={item.route}
                          href={item.route}
                          onClick={() => setOpenGroup(null)}

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

        <div>
          <div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search tickers, news"

 />
            <span>/</span>
          </div>

          <button
            type="button"
            aria-label="Search"

 >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {plan === "free" && (
            <Link
              href="/billing"

 >
              Upgrade
            </Link>
          )}

          <div>
            <button
              type="button"
              onClick={() => setAccountOpen((prev) => !prev)}

 >
              <div

 >
                {initialsOf(displayName)}
              </div>
              <div>
                <span>{displayName}</span>
                <span>{plan} plan</span>
              </div>
            </button>

            {accountOpen && (
              <div>
                {ACCOUNT_MENU.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAccountOpen(false)}

 >
                    {item.label}
                  </Link>
                ))}
                <form action={signOut}>
                  <button
                    type="submit"

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
        <div>
          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <Link
                  key={entry.route}
                  href={entry.route}

 >
                  {entry.label}
                </Link>
              );
            }
            return (
              <div key={entry.label}>
                <div>
                  {entry.label}
                </div>
                {entry.items.map((item) => {
                  const isActive = isRouteActive(pathname, item.route);
                  return (
                    <Link
                      key={item.route}
                      href={item.route}

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
