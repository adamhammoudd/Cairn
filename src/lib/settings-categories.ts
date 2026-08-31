// The six Settings tabs, in the order the mockup (Cairn Settings.dc.html) fixes
// them. A flat list - the mockup's tab bar shows all six with a sliding
// underline and horizontal scroll on a narrow screen, not a grouped dropdown.
//
// Plain module so both the server page (for the `?tab=` deep link) and the
// client tab bar can import it.

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
}

/**
 * Order is the mockup's: the two people touch most (Display, Account) lead,
 * the mostly-reference ones (Billing, Privacy & Legal) trail.
 */
export const SETTINGS_TABS: SettingsTab[] = [
  { id: "display", label: "Display" },
  { id: "account", label: "Account" },
  { id: "notifications", label: "Notifications & Alerts" },
  { id: "billing", label: "Billing" },
  { id: "assistant", label: "AI Assistant" },
  { id: "privacy", label: "Privacy & Legal" },
];

export function isSettingsTabId(value: string | undefined): value is SettingsTabId {
  return !!value && SETTINGS_TABS.some((t) => t.id === value);
}
