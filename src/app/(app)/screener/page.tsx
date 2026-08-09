import { listSavedScreens, runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { ScreenerPanel } from "@/components/screener/screener-panel";

export default async function ScreenerPage() {
  const [initialRows, savedScreens] = await Promise.all([runScreen(EMPTY_FILTERS), listSavedScreens()]);
  return <ScreenerPanel initialRows={initialRows} savedScreens={savedScreens} />;
}
