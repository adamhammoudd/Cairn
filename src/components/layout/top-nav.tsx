"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { GlobalSearch } from "@/components/layout/global-search";
import { NAV_ITEMS, isNavGroup, type NavGroup } from "@/lib/nav-items";
import { signOut } from "@/lib/actions/auth";
import { initialsOf } from "@/lib/display-name";

interface TopNavProps {
  displayName: string;
  plan: "free" | "premium";
  /** Adds the internal Operations link to the account menu. */
  isAdmin?: boolean;
}

function isRouteActive(pathname: string, route: string) {
  return route === "/" ? pathname === "/" : pathname.startsWith(route);
}

function groupHasActiveRoute(pathname: string, group: NavGroup) {
  return group.items.some((item) => isRouteActive(pathname, item.route));
}

const ACCOUNT_MENU = [
  { label: "Settings", href: "/settings" },
  // The Billing category inside Settings (?tab=billing), not the standalone /billing page.
  { label: "Billing", href: "/settings?tab=billing" },
];

// Internal route, offered only to accounts carrying the admin role and kept out
// of the main nav entirely. The route itself 404s for everyone else - this is
// the affordance, not the gate.
const ADMIN_MENU_ITEM = { label: "Operations (internal)", href: "/admin" };


// Module scope so the subscribe/snapshot identities are stable across renders;
// passing fresh closures to useSyncExternalStore resubscribes every render.
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeToHover(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getHoverSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(HOVER_QUERY).matches;
}

// The server cannot know the client's pointer type. Reporting false there
// means the first paint matches the touch layout and hover is enabled on
// hydration, rather than hydrating into a mismatch.
function getHoverServerSnapshot(): boolean {
  return false;
}

export function TopNav({ displayName, plan, isAdmin = false }: TopNavProps) {
  const pathname = usePathname();
  // A group menu opens on hover *and* toggles on click. `pinned` is the
  // click-opened group, `hovered` the pointer-opened one, and `suppressed`-
  // remembers a group the user clicked shut while the pointer is still on it -
  // without it, the hover that's still active would immediately reopen it.
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  // Touch devices synthesise a mouseenter immediately before the click, so
  // hover-to-open would open the menu and the tap would toggle it straight back
  // shut - the nav reads as dead under a finger. Only wire hover where there's
  // a real pointer; touch gets plain tap-to-toggle.
  // Previously `useState(false)` with a setter that was never called, so this
  // stayed false forever and the hover-to-open branch below was dead on every
  // device, desktop included. A media query is external state the browser
  // owns, so it is subscribed to rather than copied into React state - which
  // also keeps it correct on a laptop with a touchscreen, where the answer can
  // change mid-session.
  const canHover = useSyncExternalStore(subscribeToHover, getHoverSnapshot, getHoverServerSnapshot);
  const navRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const isGroupOpen = (label: string) => pinned === label || (hovered === label && suppressed !== label);

  function closeGroups() {
    setPinned(null);
    setHovered(null);
    setSuppressed(null);
  }

  function toggleGroup(label: string) {
    if (isGroupOpen(label)) {
      setPinned(null);
      setSuppressed(label); // pointer is still over it - don't let hover reopen
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
    function onClickAway(e: MouseEvent | TouchEvent) {
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

  return (
    <>
      <header ref={navRef} className="sticky top-0 z-30 shrink-0 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-15 max-w-[1560px] items-center gap-6.5 px-5.5">
        <Link href="/" className="flex h-11 shrink-0 items-center pr-1">
          <Logo size={24} />
        </Link>

        {/* The narrow-viewport search. This was a bare <input> wired to
            nothing - no handler, no state, no navigation - so on a phone the
            only search control in the product did nothing at all, while the
            working one was hidden until 1080px. Both are now the same
            component. */}
        <GlobalSearch className="w-full min-w-0 min-[900px]:hidden" />

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-visible min-[900px]:flex">
          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <div key={entry.route} className="relative">
                  <Link
                    href={entry.route}
                    className={`flex items-center rounded-control px-3 py-2 text-lead whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
                      isActive ? "text-primary" : "text-muted"
                    }`}
                  >
                    {entry.label}
                  </Link>
                  <span
                    className={`absolute right-3 bottom-[-12px] left-3 h-[1.5px] origin-left scale-x-0 rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-transform duration-base ease-standard ${
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
                  className={`flex items-center gap-1.5 rounded-control px-3 py-2 text-lead whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
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
                    <div className="rounded-panel border border-line bg-panel p-1 shadow-[0_18px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(47,198,133,0.05)]">
                      {entry.items.map((item) => {
                        const isActive = isRouteActive(pathname, item.route);
                        return (
                          <Link
                            key={item.route}
                            href={item.route}
                            onClick={closeGroups}
                            className={`block rounded-control px-2.5 py-2 text-body whitespace-nowrap transition-colors duration-fast ease-standard ${
                              isActive ? "bg-active text-primary" : "text-muted hover:bg-active hover:text-primary"
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
          {/* Was a bare <input> with no onChange, no onSubmit and no handler of
              any kind - the most prominent control on every screen, wired to
              nothing, complete with a "/" shortcut badge that did focus it and
              then did nothing else. GlobalSearch was already written and
              imported here; it was simply never rendered. */}
          {/* Shown from 900px, where the mobile one stops: between 900 and
              1080 there had been no search box on screen at all. */}
          <GlobalSearch className="hidden w-[150px] min-[900px]:flex min-[1080px]:w-[180px] min-[1300px]:w-[230px]" />

          {plan === "free" && (
            <Link
              href="/billing"
              className="hidden rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-3 py-1.5 text-body font-semibold whitespace-nowrap text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_22px_rgba(47,198,133,0.35)] min-[1240px]:block"
            >
              Upgrade
            </Link>
          )}

          <div className="relative hidden min-[900px]:block">
            <button
              type="button"
              onClick={() => setAccountOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-control p-1 pr-2 transition-colors duration-fast ease-standard hover:bg-active"
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold text-canvas"
                style={{ background: "var(--gradient-gain)" }}
              >
                {initialsOf(displayName)}
              </div>
              <div className="hidden min-w-0 flex-col items-start overflow-hidden min-[1000px]:flex">
                <span className="max-w-[120px] truncate text-body leading-tight text-primary">{displayName}</span>
                <span className="text-micro leading-tight text-muted capitalize">{plan} plan</span>
              </div>
            </button>

            {accountOpen && (
              <div className="animate-menu-in absolute top-[calc(100%+10px)] right-0 min-w-50 rounded-panel border border-line bg-panel p-1.5 shadow-2xl">
                {(isAdmin ? [...ACCOUNT_MENU, ADMIN_MENU_ITEM] : ACCOUNT_MENU).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAccountOpen(false)}
                    className="block rounded-control px-2.5 py-2 text-body whitespace-nowrap text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
                {/* Sign out is an exit, not a destination, and it sat flush
                    against Billing with nothing between them - one mis-aimed
                    click apart. A divider is the standard separation for a
                    leave-the-app action; it is also the honest answer to the
                    open "make sign-out red" request, which would spend the
                    product's only alarm colour on something that destroys
                    nothing. See docs/design/coherence-proposals.md. */}
                <div className="my-1 border-t border-line-soft" />
                <form action={signOut}>
                  <button
                    type="submit"
                    className="block w-full rounded-control px-2.5 py-2 text-left text-body text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
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
            className={`flex h-8 w-8.5 shrink-0 flex-col justify-center gap-1 rounded-control border bg-transparent px-2 transition-colors duration-fast ease-standard hover:border-line-strong min-[900px]:hidden ${
              mobileNavOpen ? "border-accent" : "border-line"
            }`}
          >
            <span className="block h-[1.5px] rounded-xs bg-primary" />
            <span className="block h-[1.5px] rounded-xs bg-primary" />
            <span className="block h-[1.5px] rounded-xs bg-muted" />
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
              className="flex w-full items-center gap-2.5 rounded-control p-2 text-left transition-colors duration-fast ease-standard hover:bg-raised"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-body font-semibold text-canvas"
                style={{ background: "var(--gradient-gain)" }}
              >
                {initialsOf(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lead text-primary">{displayName}</div>
                <div className="mt-0.5 text-micro text-muted capitalize">{plan} plan</div>
              </div>
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-muted)"
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
                    className="flex min-h-11 items-center rounded-control px-2 py-2 text-body text-muted transition-colors duration-fast ease-standard hover:bg-raised hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="my-1 border-t border-line-soft" />
                <form action={signOut}>
                  <button
                    type="submit"
                    className="min-h-11 w-full rounded-control px-2 py-2 text-left text-body text-muted transition-colors duration-fast ease-standard hover:bg-raised hover:text-primary"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="mb-1 border-t border-line-soft" />

          {NAV_ITEMS.map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = isRouteActive(pathname, entry.route);
              return (
                <Link
                  key={entry.route}
                  href={entry.route}
                  className={`flex min-h-11 items-center rounded-control px-2 py-2.5 text-lead transition-colors duration-fast ease-standard ${
                    isActive ? "text-primary" : "text-muted"
                  }`}
                >
                  {entry.label}
                </Link>
              );
            }
            return (
              <div key={entry.label}>
                <div className="px-2 pt-3.5 pb-1 font-mono text-eyebrow text-dim uppercase">
                  {entry.label}
                </div>
                {entry.items.map((item) => {
                  const isActive = isRouteActive(pathname, item.route);
                  return (
                    <Link
                      key={item.route}
                      href={item.route}
                      className={`flex min-h-11 items-center rounded-control px-2 py-2.5 text-lead transition-colors duration-fast ease-standard ${
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
