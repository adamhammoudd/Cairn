"use client";

import { SETTINGS_TABS, type SettingsTabId } from "@/lib/settings-categories";

// The Settings nav, transcribed from Cairn Settings.dc.html: a vertical rail
// down the left of the page rather than the horizontal strip this used to be.
// Each entry carries the section label over a one-line hint, an accent rule
// that appears on the active one, and - on Account - a badge that stays until
// two-factor is actually available.
//
// On a narrow screen the rail sits above the panels as a horizontally
// scrolling row, because a 248px sidebar and a readable panel do not both fit
// on a phone.

const RULE: Record<string, string> = {
  accent: "bg-accent",
  warning: "bg-warning",
  violet: "bg-violet",
};

interface SettingsTabBarProps {
  active: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
  /** Shows the "2FA off" badge on the Account tab. */
  twoFactorOff: boolean;
}

export function SettingsTabBar({ active, onSelect, twoFactorOff }: SettingsTabBarProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="animate-rise-in flex shrink-0 gap-1 overflow-x-auto max-lg:pb-1 lg:w-62 lg:flex-col lg:overflow-visible"
    >
      {SETTINGS_TABS.map((tab) => {
        const isActive = tab.id === active;
        const showBadge = tab.id === "account" && twoFactorOff;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(tab.id)}
            className={`relative flex shrink-0 items-center gap-2.5 rounded-panel border px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-base ease-standard hover:border-line-strong lg:hover:translate-x-0.5 ${
              isActive ? "border-line bg-raised" : "border-line-soft bg-transparent"
            }`}
          >
            <span className="flex min-w-0 flex-col leading-[1.35]">
              <span className={`text-body whitespace-nowrap ${isActive ? "text-primary" : "text-muted"}`}>
                {tab.label}
              </span>
              {/* The hint is the rail's whole point, but it needs a column to
                  wrap in - on the narrow horizontal layout there isn't one. */}
              <span className="text-micro text-dim text-pretty max-lg:hidden">{tab.hint}</span>
            </span>
            {showBadge && (
              <span className="ml-auto shrink-0 rounded-xs border border-warning/40 px-1.5 py-0.5 font-mono text-eyebrow text-warning uppercase">
                2FA off
              </span>
            )}
            <span
              aria-hidden
              className={`absolute top-2 bottom-2 left-0 w-0.5 rounded-xs transition-opacity duration-base ease-standard ${
                RULE[tab.accent]
              } ${isActive ? "opacity-100" : "opacity-0"}`}
            />
          </button>
        );
      })}
    </nav>
  );
}
