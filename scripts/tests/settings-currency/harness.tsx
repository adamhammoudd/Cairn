// Renders the REAL SettingsForm with a stub updateSettings. After a save the
// stub updates its row and the harness re-renders the form with it, the way
// revalidatePath re-renders /settings in production.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsForm } from "@/components/settings/settings-form";
import { store } from "./stub-actions-settings";

const initial = {
  user_id: "u1", default_chart_view: "3M", refresh_rate_seconds: 60, currency: "USD", metric_style: "percent",
  compact_mode: false, extended_hours: false, notification_thresholds: { price_move_percent: 5 },
  created_at: "", updated_at: "", default_asset_filter: "all", default_alert_channels: ["in_app"],
  default_comparison_timeframe: "3M", assistant_expand_methodology: true, assistant_use_portfolio_context: false,
  two_factor_status: "not_enrolled", dashboard_layout: null, sector_map_default_sector: null, briefing_hour_local: 12,
  briefing_timezone: "UTC", briefing_include_holdings: true, briefing_watchlist_ids: [], briefing_news_categories: [],
  briefing_delivery: "in_app",
};
store.row = { ...initial };
Object.assign(window, { __store: store });

function Harness() {
  const [row, setRow] = useState(store.row);
  useEffect(() => {
    store.onSaved = () => setRow({ ...store.row });
  }, []);
  return (
    <SettingsForm
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings={row as any}
      activeTab="display"
      sectorOptions={[]}
      watchlists={[]}
      fx={{ effectiveCurrency: "USD", unavailable: true, asOf: null }}
      intradayAvailable={false}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
