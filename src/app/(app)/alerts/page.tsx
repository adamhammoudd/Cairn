import { listAlerts, listDeliveries } from "@/lib/actions/alerts";
import { getUserSettings } from "@/lib/actions/settings";
import { AlertPanel } from "@/components/alerts/alert-panel";
import type { AlertChannel } from "@/lib/alerts";

export default async function AlertsPage() {
  const [alerts, deliveries, settings] = await Promise.all([listAlerts(), listDeliveries(), getUserSettings()]);
  return (
    <AlertPanel
      alerts={alerts}
      deliveries={deliveries}
      defaultChannels={(settings?.default_alert_channels as AlertChannel[]) ?? ["in_app"]}
    />
  );
}
