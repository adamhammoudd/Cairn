"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { NAV_ITEMS, isNavGroup, type NavGroup } from "@/lib/nav-items";
import { signOut } from "@/lib/actions/auth";

interface SidebarProps {
  displayName: string;
  plan: "free" | "premium";
}

function isRouteActive(pathname: string, route: string) {
  return route === "/" ? pathname === "/" : pathname.startsWith(route);
}

function groupHasActiveRoute(pathname: string, group: NavGroup) {
  return group.items.some((item) => isRouteActive(pathname, item.route));
}

export function Sidebar({ displayName, plan }: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [accountOpen, setAccountOpen] = useState(false);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col gap-0.5 border-r border-line px-4 py-6">
      <div className="mb-6 px-2">
        <Logo size={26} />
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((entry) => {
          if (!isNavGroup(entry)) {
            const isActive = isRouteActive(pathname, entry.route);
            return (
              <Link
                key={entry.route}
                href={entry.route}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors duration-fast ease-standard ${
                  isActive ? "bg-active text-primary" : "text-muted hover:text-primary"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-accent" : "bg-transparent"}`}
                />
                {entry.label}
              </Link>
            );
          }

          const hasActive = groupHasActiveRoute(pathname, entry);
          const isOpen = openGroups[entry.label] ?? hasActive;

          return (
            <div key={entry.label} className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors duration-fast ease-standard ${
                  hasActive ? "text-primary" : "text-muted hover:text-primary"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasActive ? "bg-accent" : "bg-transparent"}`}
                  />
                  {entry.label}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={`shrink-0 transition-transform duration-fast ease-standard ${isOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div
                className={`grid overflow-hidden transition-[grid-template-rows] duration-base ease-standard ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pl-5">
                  {entry.items.map((item) => {
                    const isActive = isRouteActive(pathname, item.route);
                    return (
                      <Link
                        key={item.route}
                        href={item.route}
                        className={`rounded-lg px-3 py-2 text-sm transition-colors duration-fast ease-standard ${
                          isActive ? "bg-active text-primary" : "text-muted hover:text-primary"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="relative mt-2 border-t border-line pt-2.5">
        <button
          type="button"
          onClick={() => setAccountOpen((prev) => !prev)}
          className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left transition-colors duration-fast ease-standard hover:bg-active"
        >
          <div
            className="h-[30px] w-[30px] shrink-0 rounded-full"
            style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <span className="truncate text-[13px] text-primary">{displayName}</span>
            <span className="text-[11.5px] text-muted capitalize">{plan} plan</span>
          </div>
        </button>

        {accountOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-lg">
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
      <div className="mt-2 flex items-center gap-2.5 border-t border-line pt-2.5">
        <div
          className="h-[30px] w-[30px] shrink-0 rounded-full bg-gradient-to-br from-accent-light to-accent-dark"
        />
        <div className="flex flex-col overflow-hidden">
          <span className="truncate text-[13px] text-primary">{displayName}</span>
          <span className="text-[11.5px] text-muted capitalize">{plan} plan</span>
        </div>
      </div>
    </aside>
  );
}
