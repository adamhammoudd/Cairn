export interface NavLeaf {
  label: string;
  route: string;
}

export interface NavGroup {
  label: string;
  items: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

export const NAV_ITEMS: NavEntry[] = [
  { label: "Dashboard", route: "/" },
  {
    label: "Markets",
    items: [
      { label: "Markets", route: "/markets" },
      { label: "News", route: "/news" },
      { label: "Compare", route: "/comparison" },
      { label: "Sector Map", route: "/sector-map" },
      { label: "Screener", route: "/screener" },
    ],
  },
  {
    label: "My Portfolio",
    items: [
      { label: "Portfolio", route: "/portfolio" },
      { label: "Watchlists", route: "/watchlists" },
      { label: "Alerts", route: "/alerts" },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Calculators", route: "/calculators" },
      { label: "Calendar", route: "/calendar" },
    ],
  },
  { label: "AI Assistant", route: "/assistant" },
  { label: "Billing", route: "/billing" },
];
