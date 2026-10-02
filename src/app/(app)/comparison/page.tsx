import { getTrackedSymbols, getComparisonData, getCompareSuggestions } from "@/lib/actions/comparison";
import { MAX_COMPARE } from "@/lib/comparison";
import { ComparisonPanel } from "@/components/comparison/comparison-panel";
import { getUserSettings } from "@/lib/actions/settings";
import { guardReads } from "@/components/data-unavailable";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compare - Cairn" };

// A failed market-data read renders the panel instead of throwing into a
// minified React error; anything else propagates as before.
export default async function ComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ symbols?: string }>;
}) {
  return guardReads(() => ComparisonBody({ searchParams }));
}

async function ComparisonBody({
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

  const [universe, rows, settings, suggestions] = await Promise.all([
    getTrackedSymbols(),
    getComparisonData(selected),
    getUserSettings(),
    getCompareSuggestions(),
  ]);

  return (
    <ComparisonPanel
      universe={universe}
      suggestions={suggestions}
      selected={selected}
      rows={rows}
      defaultTimeframe={settings?.default_comparison_timeframe ?? "3M"}
    />
  );
}
