"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  SETTINGS_ENTRIES,
  SETTINGS_TABS,
  isSettingsGroup,
  type SettingsGroup,
  type SettingsTabId,
} from "@/lib/settings-categories";

// The Settings category bar.
//
// This is the same interaction the main nav uses (components/layout/top-nav.tsx):
// flat entries are buttons, group entries open a dropdown on hover *and* toggle
// on click, the active entry carries the accent underline, and touch devices
// get plain tap-to-toggle because they synthesise a mouseenter immediately
// before the click - hover-to-open there would open the menu and the tap would
// close it again, so the control reads as dead under a finger.
//
// Duplicated rather than extracted into a shared component because the two
// differ in what they do on select (navigate vs. switch panel) and in their
// chrome (sticky app header vs. in-page sub-header); what has to match is the
// behaviour, and that is what these comments pin down. If a third surface ever
// needs it, that is the point to extract.

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

// The server cannot know the client's pointer type. Reporting false there means
// the first paint matches the touch layout and hover is enabled on hydration,
// rather than hydrating into a mismatch.
function getHoverServerSnapshot(): boolean {
  return false;
}

function groupHasActive(group: SettingsGroup, active: SettingsTabId): boolean {
  return group.items.some((item) => item.id === active);
}

interface SettingsSubheaderProps {
  active: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
}

export function SettingsSubheader({ active, onSelect }: SettingsSubheaderProps) {
  // `pinned` is the click-opened group, `hovered` the pointer-opened one, and
  // `suppressed` remembers a group the user clicked shut while the pointer is
  // still over it - without it, the still-active hover would reopen it.
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState<string | null>(null);
  const canHover = useSyncExternalStore(subscribeToHover, getHoverSnapshot, getHoverServerSnapshot);
  const barRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function onClickAway(e: MouseEvent | TouchEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) closeGroups();
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

  function select(id: SettingsTabId) {
    onSelect(id);
    closeGroups();
  }

  return (
    <div ref={barRef} className="mb-4 border-b border-line">
      {/* Under 640px the bar becomes a select: six categories, two of them
          nested, do not survive being squeezed onto a phone as a scroll strip
          that hides half its own options. */}
      <div className="pb-3 sm:hidden">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Category</span>
          <select
            value={active}
            onChange={(e) => onSelect(e.target.value as SettingsTabId)}
            className="w-full rounded-lg border border-line bg-active px-3.5 py-2.5 text-[13px] text-primary outline-none"
          >
            {SETTINGS_TABS.map((t) => (
              <option key={t.id} value={t.id} className="bg-panel">
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav aria-label="Settings categories" className="hidden items-center gap-0.5 sm:flex">
        {SETTINGS_ENTRIES.map((entry) => {
          if (!isSettingsGroup(entry)) {
            const isActive = entry.id === active;
            return (
              <div key={entry.id} className="relative">
                <button
                  type="button"
                  onClick={() => select(entry.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center rounded-t-lg px-3 py-2.25 text-[13.5px] whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
                    isActive ? "text-primary" : "text-muted"
                  }`}
                >
                  {entry.label}
                </button>
                <span
                  className={`absolute right-3 bottom-[-1px] left-3 h-[1.5px] origin-left scale-x-0 rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-transform duration-base ease-standard ${
                    isActive ? "scale-x-100" : ""
                  }`}
                />
              </div>
            );
          }

          const hasActive = groupHasActive(entry, active);
          const isOpen = isGroupOpen(entry.label);

          return (
            <div
              key={entry.label}
              className="relative"
              onMouseEnter={
                canHover
                  ? () => {
                      setHovered(entry.label);
                      setSuppressed((prev) => (prev === entry.label ? prev : null));
                    }
                  : undefined
              }
              onMouseLeave={
                canHover
                  ? () => {
                      setHovered((prev) => (prev === entry.label ? null : prev));
                      setSuppressed((prev) => (prev === entry.label ? null : prev));
                      setPinned((prev) => (prev === entry.label ? null : prev));
                    }
                  : undefined
              }
            >
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                aria-expanded={isOpen}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2.25 text-[13.5px] whitespace-nowrap transition-colors duration-fast ease-standard hover:bg-active ${
                  hasActive || isOpen ? "text-primary" : "text-muted"
                }`}
              >
                {hasActive ? entry.items.find((i) => i.id === active)?.label : entry.label}
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
                className={`absolute right-3 bottom-[-1px] left-3 h-[1.5px] origin-left scale-x-0 rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-transform duration-base ease-standard ${
                  hasActive ? "scale-x-100" : ""
                }`}
              />

              {isOpen && (
                // pt-2 is a transparent hover bridge, not a gap: offsetting the
                // panel itself would drop the pointer out of the group on the
                // way down and close the menu before it can be clicked.
                <div className="animate-menu-in absolute top-full left-0 z-30 min-w-56 pt-2">
                  <div className="rounded-xl border border-line bg-panel p-1.25 shadow-[0_18px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(47,198,133,0.05)]">
                    {entry.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => select(item.id)}
                        className={`block w-full rounded-lg px-2.5 py-2 text-left text-[13px] whitespace-nowrap transition-colors duration-fast ease-standard ${
                          item.id === active
                            ? "bg-active text-primary"
                            : "text-muted hover:bg-[#191919] hover:text-primary"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
