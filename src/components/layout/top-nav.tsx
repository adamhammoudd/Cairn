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
  // A group menu opens on hover *and* toggles on click. `pinned` is the
  // click-opened group, `hovered` the pointer-opened one, and `suppressed`
  // remembers a group the user clicked shut while the pointer is still on it —
  // without it, the hover that's still active would immediately reopen it.
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  // Touch devices synthesise a mouseenter immediately before the click, so
  // hover-to-open would open the menu and the tap would toggle it straight back
  // shut — the nav reads as dead under a finger. Only wire hover where there's
  // a real pointer; touch gets plain tap-to-toggle.
  const [canHover, setCanHover] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setCanHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const isGroupOpen = (label: string) => pinned === label || (hovered === label && suppressed !== label);

  function closeGroups() {
    setPinned(null);
    setHovered(null);
    setSuppressed(null);
  }

  function toggleGroup(label: string) {
    if (isGroupOpen(label)) {
      setPinned(null);
      setSuppressed(label); // pointer is still over it — don't let hover reopen
    } else {
      setPinned(label);
      setSuppressed(null);
    }
  }

  function enterGroup(label: string) {
    setHovered(label);
    setSuppressed((prev) => (prev === label ? prev : null));
  }

  function leaveGroup(label: string) {
    setHovered((prev) => (prev === label ? null : prev));
    setSuppressed((prev) => (prev === label ? null : prev));
    setPinned((prev) => (prev === label ? null : prev));
  }

  // Collapse any open menu when the route changes. Adjusted during render
  // rather than in an effect so there's no extra commit with the menu still
  // open on the new page (React's "adjusting state when props change").
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    closeGroups();
    setAccountOpen(false);
    setMobileNavOpen(false);
  }

  useEffect(() => {
    function onClickAway(e: Event) {
      const target = e.target as Node;
      const inside =
        (navRef.current && navRef.current.contains(target)) ||
        (drawerRef.current && drawerRef.current.contains(target));
      if (!inside) {
        setPinned(null);
        setHovered(null);
        setSuppressed(null);
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    // iOS doesn't always deliver mousedown for taps outside an interactive
    // element, so listen for the touch too.
    document.addEventListener("touchstart", onClickAway);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("touchstart", onClickAway);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

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
    <>
      <header ref={navRef} className="sticky top-0 z-30 shrink-0 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-15 max-w-[1560px] items-center gap-6.5 px-5.5">
        <Link href="/" className="shrink-0 pr-1">
          <Logo size={24} />
        </Link>

        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-line px-2.75 py-1.75 transition-colors duration-base ease-standard hover:border-[#3A3A3A] min-[900px]:hidden">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" strokeWidth="2" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search"
            className="w-full min-w-0 bg-transparent text-[12.5px] text-primary placeholder:text-dim outline-none"
          />
        </div>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-visible min-[900px]:flex">
          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <div key={entry.route} className="relative">
                  <Link
                    href={entry.route}
                    className={`flex items-center rounded-lg px-2.75 py-1.75 text-[13.5px] whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
                      isActive ? "text-primary" : "text-muted"
                    }`}
                  >
                    {entry.label}
                  </Link>
                  <span
                    className={`absolute right-2.75 bottom-[-12px] left-2.75 h-[1.5px] origin-left scale-x-0 rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-transform duration-base ease-standard ${
                      isActive ? "scale-x-100" : ""
                    }`}
                  />
                </div>
              );
            }

            const hasActive = groupHasActiveRoute(pathname, entry);
            const isOpen = isGroupOpen(entry.label);

            return (
              <div
                key={entry.label}
                className="relative"
                onMouseEnter={canHover ? () => enterGroup(entry.label) : undefined}
                onMouseLeave={canHover ? () => leaveGroup(entry.label) : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.75 py-1.75 text-[13.5px] whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
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
                  // pt-2.5 is a transparent hover bridge, not a gap: offsetting
                  // the panel itself would drop the pointer out of the group on
                  // the way down and close the menu before it can be clicked.
                  <div className="animate-menu-in absolute top-full left-0 z-50 min-w-52 pt-2.5">
                    <div className="rounded-xl border border-line bg-panel p-1.25 shadow-[0_18px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(47,198,133,0.05)]">
                      {entry.items.map((item) => {
                        const isActive = isRouteActive(pathname, item.route);
                        return (
                          <Link
                            key={item.route}
                            href={item.route}
                            onClick={closeGroups}
                            className={`block rounded-lg px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors duration-fast ease-standard ${
                              isActive ? "bg-active text-primary" : "text-muted hover:bg-[#191919] hover:text-primary"
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
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

          {plan === "free" && (
            <Link
              href="/billing"
              className="hidden rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_22px_rgba(47,198,133,0.35)] min-[1240px]:block"
            >
              Upgrade
            </Link>
          )}

          <div className="relative hidden min-[900px]:block">
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

          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
            className={`flex h-8 w-8.5 shrink-0 touch-manipulation flex-col justify-center gap-1 rounded-lg border bg-transparent px-1.75 transition-colors duration-fast ease-standard hover:border-[#3A3A3A] min-[900px]:hidden ${
              mobileNavOpen ? "border-accent" : "border-line"
            }`}
          >
            <span className="block h-[1.5px] rounded-sm bg-primary" />
            <span className="block h-[1.5px] rounded-sm bg-primary" />
            <span className="block h-[1.5px] rounded-sm bg-muted" />
          </button>
        </div>
      </div>

      </header>

      {mobileNavOpen && (
        <div ref={drawerRef} className="animate-menu-in fixed inset-x-0 top-15 bottom-0 z-40 overflow-y-auto overscroll-contain bg-canvas px-3.5 pt-3 pb-4 min-[900px]:hidden">
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setAccountOpen((prev) => !prev)}
              className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors duration-fast ease-standard hover:bg-[#151515]"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold text-canvas"
                style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
              >
                {initialsOf(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-primary">{displayName}</div>
                <div className="mt-0.5 text-[11px] text-muted capitalize">{plan} plan</div>
              </div>
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8A8A8A"
                strokeWidth="3"
                className={`shrink-0 transition-transform duration-base ease-standard ${accountOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {accountOpen && (
              <div className="animate-menu-in flex flex-col py-1 pr-1 pl-11">
                {ACCOUNT_MENU.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-2 py-2.25 text-[13px] text-muted transition-colors duration-fast ease-standard hover:bg-[#151515] hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-lg px-2 py-2.25 text-left text-[13px] text-muted transition-colors duration-fast ease-standard hover:bg-[#151515] hover:text-primary"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="mb-1 border-t border-[#1E1E1E]" />

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
    </>
  );
}
