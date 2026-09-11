"use client";

import { SETTINGS_TABS, type SettingsTabId } from "@/lib/settings-categories";

// The Settings tab bar, transcribed from Cairn Settings.dc.html: a sticky row
// (top: 60px, under the app header), full-bleed hairline, horizontal scroll on
// a narrow screen, and a 2px accent underline that slides between tabs
// (scaleX 0->1, 180ms). The Account tab carries a "2FA off" badge until 2FA is
// enrolled.

interface SettingsTabBarProps {
  active: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
  /** Shows the "2FA off" badge on the Account tab. */
  twoFactorOff: boolean;
}

export function SettingsTabBar({ active, onSelect, twoFactorOff }: SettingsTabBarProps) {
  return (
    <div className="sticky top-15 z-20 -mx-5.5 mb-5.5 border-b border-line bg-canvas/95 px-5.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1156px] items-center gap-0.5 overflow-x-auto">
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab.id === active;
          const showBadge = tab.id === "account" && twoFactorOff;
          return (
            <div key={tab.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                className="flex items-center gap-2 border-0 bg-transparent px-3 py-3 text-lead whitespace-nowrap transition-colors duration-fast ease-standard hover:text-primary"
              >
                <span className={isActive ? "text-primary" : "text-muted"}>{tab.label}</span>
                {showBadge && (
                  <span className="rounded-xs border border-[rgba(217,164,65,0.35)] bg-[rgba(217,164,65,0.08)] px-1.5 py-0.5 font-mono text-eyebrow text-warning uppercase">
                    2FA off
                  </span>
                )}
              </button>
              <div
                className="absolute right-3 bottom-0 left-3 h-0.5 origin-left rounded-xs bg-gradient-to-r from-accent-light to-accent-dark transition-transform duration-base ease-standard"
                style={{ transform: `scaleX(${isActive ? 1 : 0})` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
