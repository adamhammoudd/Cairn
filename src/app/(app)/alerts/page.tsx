import { listAlerts, listDeliveries } from "@/lib/actions/alerts";
import { getComparisonData } from "@/lib/actions/comparison";
import { getUserSettings } from "@/lib/actions/settings";
import { AlertPanel, type AlertQuotes } from "@/components/alerts/alert-panel";
import type { AlertChannel } from "@/lib/alerts";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Alerts - Cairn" };

export default async function AlertsPage() {
  const [alerts, deliveries, settings] = await Promise.all([listAlerts(), listDeliveries(), getUserSettings()]);

  // Each price and %-move card shows where the market sits against its level,
  // so it needs the latest close. Only those two types have a level to measure
  // against; the others (volume, crossover, AI confidence) carry no bar.
  const symbols = Array.from(
    new Set(alerts.filter((a) => a.alert_type === "price" || a.alert_type === "pct_change").map((a) => a.scope_value)),
  );
  const quotes: AlertQuotes = {};
  if (symbols.length > 0) {
    try {
      for (const row of await getComparisonData(symbols)) {
        quotes[row.symbol] = { price: row.price, changePct: row.changePct };
      }
    } catch {
      // A failed market-data read leaves the cards without a distance bar
      // rather than taking the whole page down; the alerts themselves are
      // unaffected.
    }
  }

  return (
    <AlertPanel
      alerts={alerts}
      deliveries={deliveries}
      quotes={quotes}
      defaultChannels={(settings?.default_alert_channels as AlertChannel[]) ?? ["in_app"]}
    />
  );
}
