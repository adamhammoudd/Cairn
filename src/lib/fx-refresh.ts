import { ecbHistoryRows, parseEcbHistory, ECB_HIST_90D_URL } from "@/lib/market-data/fx";

// The daily top-up of fx_rates_daily (migration 0065). Until now the only code
// that wrote the table was scripts/backfill-fx-rates.ts run by hand, while the
// migration's comment said "the same upsert from the daily job" - there was no
// daily job, so the table stopped at the last manual run (1 Oct) and every
// purchase after it fell back to today's rate (audit 2026-10-02, item 1.6).
//
// Called by /api/cron/refresh-fx-rates once a day. It upserts the ECB's last-90-
// days file, which is idempotent and also repairs any gap shorter than 90 days
// (a missed run does not leave a hole). A day with no new ECB publication
// (weekend, TARGET holiday) simply adds no row; reads carry the previous rate
// forward - rateOn() in lib/fx-history.ts, for up to MAX_RATE_GAP_DAYS.

export interface FxRefreshDeps {
  fetchXml: (url: string) => Promise<string>;
  upsert: (rows: { date: string; currency: string; rate_per_eur: number }[]) => Promise<void>;
}

export type FxRefreshResult =
  | { outcome: "ok"; publications: number; rows: number; newestDate: string }
  | { outcome: "error"; reason: string };

export async function refreshFxRates(deps: FxRefreshDeps): Promise<FxRefreshResult> {
  let days;
  try {
    days = parseEcbHistory(await deps.fetchXml(ECB_HIST_90D_URL));
  } catch (err) {
    return { outcome: "error", reason: `ECB file unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (days.length === 0) return { outcome: "error", reason: "ECB file had no publications (unrecognised format)" };

  const rows = ecbHistoryRows(days);
  const BATCH = 1000;
  try {
    for (let i = 0; i < rows.length; i += BATCH) await deps.upsert(rows.slice(i, i + BATCH));
  } catch (err) {
    return { outcome: "error", reason: `write failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { outcome: "ok", publications: days.length, rows: rows.length, newestDate: days[days.length - 1].date };
}
