export interface NavItem {
  label: string;
  route: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", route: "/" },
  { label: "Portfolio", route: "/portfolio" },
  { label: "Markets", route: "/markets" },
  { label: "Screener", route: "/screener" },
  { label: "Watchlists", route: "/watchlists" },
  { label: "Compare", route: "/comparison" },
  { label: "Sector Map", route: "/sector-map" },
  { label: "Alerts", route: "/alerts" },
  { label: "Calendar", route: "/calendar" },
  { label: "News", route: "/news" },
  { label: "Crypto", route: "/crypto" },
  { label: "Calculators", route: "/calculators" },
  { label: "AI Assistant", route: "/assistant" },
  { label: "Billing", route: "/billing" },
  { label: "Settings", route: "/settings" },
];
