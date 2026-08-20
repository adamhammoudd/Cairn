import { getTrackedSymbols, getComparisonData } from "@/lib/actions/comparison";
import { MAX_COMPARE } from "@/lib/comparison";
import { ComparisonPanel } from "@/components/comparison/comparison-panel";
import { getUserSettings } from "@/lib/actions/settings";

export default async function ComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ symbols?: string }>;
}) {
  const { symbols: symbolsParam } = await searchParams;
  const selected = (symbolsParam ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);

  const [universe, rows, settings] = await Promise.all([
    getTrackedSymbols(),
    getComparisonData(selected),
    getUserSettings(),
  ]);

  return (
    <ComparisonPanel
      universe={universe}
      selected={selected}
      rows={rows}
      defaultTimeframe={settings?.default_comparison_timeframe ?? "3M"}
    />
  );
}
