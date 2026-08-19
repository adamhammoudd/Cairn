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
  { label: "Base Camp", route: "/" },
  {
    label: "Markets",
    items: [
      { label: "Markets", route: "/markets" },
      { label: "News", route: "/news" },
      { label: "Compare", route: "/comparison" },
      { label: "Sector map", route: "/sector-map" },
      { label: "Screener", route: "/screener" },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { label: "Holdings", route: "/portfolio" },
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
  { label: "Assistant", route: "/assistant" },
];
