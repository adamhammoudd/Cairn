import { listAlerts, listDeliveries } from "@/lib/actions/alerts";
import { AlertPanel } from "@/components/alerts/alert-panel";

export default async function AlertsPage() {
  const [alerts, deliveries] = await Promise.all([listAlerts(), listDeliveries()]);
  return <AlertPanel alerts={alerts} deliveries={deliveries} />;
}
