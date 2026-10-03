import { listSavedScreens, runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { ScreenerPanel } from "@/components/screener/screener-panel";

import { guardReads } from "@/components/data-unavailable";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Screener - Cairn" };

// A failed market-data read renders the panel instead of throwing into a
// minified React error; anything else propagates as before.
export default async function ScreenerPage() {
  return guardReads(ScreenerBody);
}


async function ScreenerBody() {
  const [initialRows, savedScreens] = await Promise.all([runScreen(EMPTY_FILTERS), listSavedScreens()]);
  return <ScreenerPanel initialRows={initialRows} savedScreens={savedScreens} />;
}
