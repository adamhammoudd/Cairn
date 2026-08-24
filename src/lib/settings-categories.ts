// The Settings sub-header, described the same way lib/nav-items.ts describes
// the main nav - a flat entry or a group with children - so the two use one
// interaction model rather than the sub-header inventing its own.
//
// Plain module so both the server page (for the initial category) and the
// client tab bar can import it.

export interface SettingsLeaf {
  id: SettingsTabId;
  label: string;
  /** One line under the panel title, saying what the category is for. */
  blurb: string;
}

export interface SettingsGroup {
  label: string;
  items: SettingsLeaf[];
}

export type SettingsTabId =
  | "display"
  | "account"
  | "notifications"
  | "billing"
  | "assistant"
  | "privacy";

export function isSettingsGroup(entry: SettingsEntry): entry is SettingsGroup {
  return "items" in entry;
}

export type SettingsEntry = SettingsLeaf | SettingsGroup;

/**
 * Order is fixed and deliberate: the two people change most often (Display,
 * Account) lead, and the two that are mostly reference (Billing, Privacy &
 * Legal) trail.
 *
 * Notifications & Alerts and AI Assistant are grouped because the sub-header
 * has to fit six categories on a laptop without wrapping, and those two are
 * the pair a reader is most likely to look for together ("what does Cairn send
 * me, and when"). The group opens on hover and toggles on click, exactly like
 * a nav group in components/layout/top-nav.tsx.
 */
export const SETTINGS_ENTRIES: SettingsEntry[] = [
  {
    id: "display",
    label: "Display",
    blurb: "Currency, density, and what each page opens on.",
  },
  {
    id: "account",
    label: "Account",
    blurb: "Profile, password, two-factor, your data.",
  },
  {
    label: "Delivery",
    items: [
      {
        id: "notifications",
        label: "Notifications & Alerts",
        blurb: "Defaults for new alerts, and the account-wide movement floor.",
      },
      {
        id: "assistant",
        label: "AI Assistant",
        blurb: "When the daily briefing runs and what feeds it.",
      },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    blurb: "Plan, usage this period, and plan history.",
  },
  {
    id: "privacy",
    label: "Privacy & Legal",
    blurb: "Policies, cookies, and how Cairn uses AI.",
  },
];

/** Flat list in sub-header order, for lookups and for the mobile select. */
export const SETTINGS_TABS: SettingsLeaf[] = SETTINGS_ENTRIES.flatMap((entry) =>
  isSettingsGroup(entry) ? entry.items : [entry],
);

export function settingsTabById(id: SettingsTabId): SettingsLeaf {
  return SETTINGS_TABS.find((t) => t.id === id) ?? SETTINGS_TABS[0];
}

/** Only ids that exist - guards the `?tab=` deep link. */
export function isSettingsTabId(value: string | undefined): value is SettingsTabId {
  return SETTINGS_TABS.some((t) => t.id === value);
}
