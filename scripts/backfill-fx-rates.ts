// Loads the ECB's daily reference rates into fx_rates_daily (migration 0065), so
// a holding's cost can be converted at the rate on its purchase date.
//
// Same source as today's rate (src/lib/market-data/fx.ts): the ECB's published
// files. No new provider. Idempotent - rows are upserted on (date, currency), so
// running it twice, or daily, only ever fills in what is missing or corrects it.
//
//   npx tsx --conditions=react-server scripts/backfill-fx-rates.ts            # full history since 1999
//   npx tsx --conditions=react-server scripts/backfill-fx-rates.ts --recent   # last 90 days (daily top-up)
//   npx tsx --conditions=react-server scripts/backfill-fx-rates.ts --dry-run  # parse and count, write nothing
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local,
// loaded by ./tests/env). Apply migration 0065 first.

import "./tests/env";
import { createClient } from "@supabase/supabase-js";
import { ECB_HIST_90D_URL, ECB_HIST_URL, ecbHistoryRows, parseEcbHistory } from "../src/lib/market-data/fx";

const recent = process.argv.includes("--recent");
const dryRun = process.argv.includes("--dry-run");
const BATCH = 1000;

async function main() {
  const url = recent ? ECB_HIST_90D_URL : ECB_HIST_URL;
  console.log(`Fetching ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`ECB history: HTTP ${res.status}`);
  const days = parseEcbHistory(await res.text());
  if (days.length === 0) throw new Error("ECB history: no publications found - unrecognised file");
  const rows = ecbHistoryRows(days);
  console.log(`Parsed ${days.length} publication dates (${days[0].date} .. ${days[days.length - 1].date}), ${rows.length} rows`);
  if (dryRun) return console.log("Dry run - nothing written.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  const supabase = createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from("fx_rates_daily").upsert(rows.slice(i, i + BATCH), { onConflict: "date,currency" });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
  }
  const { count } = await supabase.from("fx_rates_daily").select("*", { count: "exact", head: true });
  console.log(`Done. fx_rates_daily now holds ${count} rows.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
