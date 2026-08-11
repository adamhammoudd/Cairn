import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { MarketsPanel } from "@/components/markets/markets-panel";

export default async function MarketsPage() {
  const rows = await runScreen(EMPTY_FILTERS);
  return <MarketsPanel rows={rows} />;
}
