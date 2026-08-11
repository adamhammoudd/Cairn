import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { getCryptoOverview } from "@/lib/actions/crypto";
import { MarketsPanel } from "@/components/markets/markets-panel";

export default async function MarketsPage() {
  const [rows, cryptoRows] = await Promise.all([runScreen(EMPTY_FILTERS), getCryptoOverview()]);
  return <MarketsPanel rows={rows} cryptoRows={cryptoRows} />;
}
