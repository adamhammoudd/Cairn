// The six Settings tabs, in the order the mockup (Cairn Settings.dc.html)
// fixes them. A flat list - the mockup's nav is a vertical rail down the left
// of the page, each entry carrying a one-line hint about what it changes and a
// coloured rule that marks the active one.
//
// Plain module so both the server page (for the `?tab=` deep link) and the
// client nav can import it.

export type SettingsTabId =
  | "display"
  | "account"
  | "notifications"
  | "billing"
  | "assistant"
  | "privacy";

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  /** The mockup's sub-line: what this section actually changes. */
  hint: string;
  /** Accent for the rail's active rule and the panel header's tint. */
  accent: "accent" | "warning" | "violet";
}

/**
 * Order is the mockup's: the two people touch most (Display, Account) lead,
 * the mostly-reference ones (Billing, Privacy & Legal) trail.
 */
export const SETTINGS_TABS: SettingsTab[] = [
  { id: "display", label: "Display", hint: "Charts, currency, density", accent: "accent" },
  { id: "account", label: "Account", hint: "Profile, password, your data", accent: "accent" },
  { id: "notifications", label: "Notifications & Alerts", hint: "Delivery and thresholds", accent: "warning" },
  { id: "billing", label: "Billing", hint: "Plan and usage this period", accent: "accent" },
  { id: "assistant", label: "AI Assistant", hint: "Briefing and answer style", accent: "violet" },
  { id: "privacy", label: "Privacy & Legal", hint: "Disclosures and policies", accent: "violet" },
];

export function isSettingsTabId(value: string | undefined): value is SettingsTabId {
  return !!value && SETTINGS_TABS.some((t) => t.id === value);
}
