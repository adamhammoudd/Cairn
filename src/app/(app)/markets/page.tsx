import { runScreen } from "@/lib/actions/screener";
import { EMPTY_FILTERS } from "@/lib/screener";
import { getCryptoOverview } from "@/lib/actions/crypto";
import { getUserSettings } from "@/lib/actions/settings";
import { MarketsPanel } from "@/components/markets/markets-panel";
import { createClient } from "@/lib/supabase/server";
import { MIGRATIONS, unwrapRows } from "@/lib/supabase/read";

export default async function MarketsPage() {
  const supabase = await createClient();
  const [rows, cryptoRows, settings, directory] = await Promise.all([
    runScreen(EMPTY_FILTERS),
    getCryptoOverview(),
    getUserSettings(),
    // Real demand, recorded by the on-demand ingest path every time a symbol is
    // opened or searched. The "Most searched" deck ranks by this rather than by
    // an editorial list, so it cannot claim popularity it has no evidence for.
    supabase.from("symbol_directory").select("symbol, request_count").order("request_count", { ascending: false }).limit(200),
  ]);

  // Not `directory.data ?? []`: when symbol_directory is missing (0027 never
  // applied) that reads as "nothing has been searched" and the page renders
  // empty rather than saying the database is behind the code.
  const requestCounts: Record<string, number> = {};
  for (const row of unwrapRows("Markets demand ranking (symbol_directory)", directory, MIGRATIONS.onDemandIngestion)) {
    requestCounts[row.symbol] = row.request_count;
  }

  return (
    <MarketsPanel
      rows={rows}
      cryptoRows={cryptoRows}
      defaultFilter={settings?.default_asset_filter ?? "all"}
      requestCounts={requestCounts}
    />
  );
}
