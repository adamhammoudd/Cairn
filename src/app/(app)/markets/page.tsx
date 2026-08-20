import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { getCryptoOverview } from "@/lib/actions/crypto";
import { getUserSettings } from "@/lib/actions/settings";
import { MarketsPanel } from "@/components/markets/markets-panel";

export default async function MarketsPage() {
  const [rows, cryptoRows, settings] = await Promise.all([
    runScreen(EMPTY_FILTERS),
    getCryptoOverview(),
    getUserSettings(),
  ]);
  return (
    <MarketsPanel rows={rows} cryptoRows={cryptoRows} defaultFilter={settings?.default_asset_filter ?? "all"} />
  );
}
