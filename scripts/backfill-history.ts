// One-off: deepen stored daily price history to everything the provider has
// (fix/history-depth).
//
// Stored history is clipped at whichever window first filled it: 2 years for
// symbols ingested on demand (range=2y), 5 years for analysed tickers, and
// 365 days for coins filled by ingest-crypto's CoinGecko pass. This fetches
// full daily history for the clipped symbols and upserts it.
//
// Which symbols (selectBackfillCandidates, tested in the history-depth suite):
//   - every equity / ETF / index / forex / future we store;
//   - crypto whose stored history is at least CRYPTO_CLIPPED_DAYS old. The
//     shortest clip is CoinGecko's 365 days, so anything that old may be
//     clipped; a coin whose first bar is newer than that is young and already
//     holds everything there is.
//
// Every candidate is identity-checked first (pricesAgree): the provider's
// recent closes must match the stored ones. A ticker is not an identity - the
// same letters are often a different coin or a listed fund on the provider
// (BTC once resolved to a $37 ETF) - and a mismatch is refused, never written.
//
//   DRY RUN (default): no database writes. Probes the provider (read-only,
//   same request budget as the app) and prints stored vs available, the rows
//   the backfill would add, identity-check refusals, and a size estimate.
//
//   --apply: [DECISION: Adam] probes and identity-checks the same way, then
//   writes through ensureSymbolIngested({ range: "max", force: true }) - the
//   app's own ingest path, with its instrument-class check and directory
//   update. Throttled to one provider call every THROTTLE_MS.
//
// Run: npx tsx --conditions=react-server scripts/backfill-history.ts [--apply] [--only=SYM,SYM]
import "./tests/env";
import { pathToFileURL } from "node:url";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSymbolIngested, probeProviderHistory, FULL_HISTORY_RANGE } from "@/lib/market-data/ingest";

/** ~1.1s between provider calls keeps well under the 60/minute budget in ingest.ts. */
const THROTTLE_MS = 1100;
/** Below CoinGecko's 365-day window, with margin: a coin this old may have been clipped by it. */
const CRYPTO_CLIPPED_DAYS = 300;
/** Median provider/stored close ratio must be within this of 1 for the series to be the same instrument. */
const IDENTITY_TOLERANCE = 0.03;
/** Measured 2026-09-27: historical_prices 35 MB total for 121,733 rows, indexes included. */
const BYTES_PER_ROW = Math.round((35 * 1024 * 1024) / 121_733);

export interface StoredSeries {
  symbol: string;
  assetType: string | null;
  bars: number;
  firstTs: string;
}

export function selectBackfillCandidates(rows: StoredSeries[], today: Date): StoredSeries[] {
  const edge = new Date(today.getTime() - CRYPTO_CLIPPED_DAYS * 86_400_000).toISOString().slice(0, 10);
  return rows.filter((r) => (r.assetType === "crypto" ? r.firstTs <= edge : true));
}

/**
 * Same instrument? Compares closes on the dates both series have. Needs at
 * least 5 shared dates, and the median ratio within IDENTITY_TOLERANCE -
 * a different coin or a fund under the same ticker is off by far more.
 */
export function pricesAgree(
  stored: { ts: string; close: number }[],
  provider: { ts: string; close: number }[],
): { ok: boolean; shared: number; medianRatio: number | null } {
  const byDate = new Map(stored.map((s) => [s.ts, s.close]));
  const ratios = provider
    .filter((p) => byDate.has(p.ts) && (byDate.get(p.ts) ?? 0) > 0 && p.close > 0)
    .map((p) => p.close / (byDate.get(p.ts) as number))
    .sort((a, b) => a - b);
  if (ratios.length < 5) return { ok: false, shared: ratios.length, medianRatio: null };
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return { ok: Math.abs(median - 1) <= IDENTITY_TOLERANCE, shared: ratios.length, medianRatio: Number(median.toFixed(4)) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readStoredSeries(): Promise<StoredSeries[]> {
  const db = createAdminClient();
  const { data: dir, error } = await db.from("symbol_directory").select("symbol, asset_type").eq("status", "available");
  if (error) throw new Error(`symbol_directory: ${error.message}`);
  const out: StoredSeries[] = [];
  for (const d of dir ?? []) {
    const [{ count }, { data: first }] = await Promise.all([
      db.from("historical_prices").select("*", { count: "exact", head: true }).eq("symbol", d.symbol),
      db.from("historical_prices").select("ts").eq("symbol", d.symbol).order("ts", { ascending: true }).limit(1),
    ]);
    if (!count || !first?.[0]) continue; // nothing stored: not a backfill case
    out.push({ symbol: d.symbol, assetType: d.asset_type, bars: count, firstTs: String(first[0].ts).slice(0, 10) });
  }
  return out;
}

async function storedCloses(symbol: string, dates: string[]): Promise<{ ts: string; close: number }[]> {
  const { data } = await createAdminClient().from("historical_prices").select("ts, close").eq("symbol", symbol).in("ts", dates);
  return (data ?? []).filter((r) => r.close !== null).map((r) => ({ ts: String(r.ts).slice(0, 10), close: Number(r.close) }));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map((s) => s.trim().toUpperCase());

  const stored = await readStoredSeries();
  let candidates = selectBackfillCandidates(stored, new Date());
  if (only) candidates = candidates.filter((c) => only.includes(c.symbol));
  const skipped = stored.length - candidates.length;

  console.log(`# History backfill - ${apply ? "APPLY" : "DRY RUN (no writes)"}`);
  console.log(`\n${stored.length} stored symbols; ${candidates.length} candidates; ${skipped} skipped (coins younger than ${CRYPTO_CLIPPED_DAYS} days, which already hold their full history).\n`);
  console.log("| Symbol | Type | Stored bars | Stored from | Provider bars | Provider from | Rows to add | Result |");
  console.log("|---|---|---:|---|---:|---|---:|---|");

  let totalAdd = 0;
  let refused = 0;
  let failed = 0;
  let nothingToAdd = 0;
  for (const c of candidates) {
    await sleep(THROTTLE_MS);
    const probe = await probeProviderHistory(c.symbol, c.assetType, FULL_HISTORY_RANGE);
    if (!probe.ok) {
      failed++;
      console.log(`| ${c.symbol} | ${c.assetType} | ${c.bars} | ${c.firstTs} | - | - | 0 | ${probe.status}: ${probe.detail} |`);
      continue;
    }
    const identity = pricesAgree(await storedCloses(c.symbol, probe.recent.map((r) => r.ts)), probe.recent);
    if (!identity.ok) {
      refused++;
      console.log(`| ${c.symbol} | ${c.assetType} | ${c.bars} | ${c.firstTs} | ${probe.bars} | ${probe.firstTs} | 0 | REFUSED: provider prices don't match stored (${identity.shared} shared dates, median ratio ${identity.medianRatio ?? "n/a"}) |`);
      continue;
    }
    // Upsert on (symbol, ts): only bars older than what is stored are new.
    const add = Math.max(probe.bars - c.bars, 0);
    if (add === 0) {
      nothingToAdd++;
      console.log(`| ${c.symbol} | ${c.assetType} | ${c.bars} | ${c.firstTs} | ${probe.bars} | ${probe.firstTs} | 0 | already complete |`);
      continue;
    }
    if (!apply) {
      totalAdd += add;
      console.log(`| ${c.symbol} | ${c.assetType} | ${c.bars} | ${c.firstTs} | ${probe.bars} | ${probe.firstTs} | ${add} | would fetch |`);
      continue;
    }
    await sleep(THROTTLE_MS);
    const res = await ensureSymbolIngested(c.symbol, { range: FULL_HISTORY_RANGE, force: true });
    if (res.status !== "available") failed++;
    else totalAdd += add;
    console.log(`| ${c.symbol} | ${c.assetType} | ${c.bars} | ${c.firstTs} | ${res.bars} | ${probe.firstTs} | ${res.status === "available" ? add : 0} | ${res.status}${res.detail ? `: ${res.detail}` : ""} |`);
  }

  const mb = (totalAdd * BYTES_PER_ROW) / (1024 * 1024);
  console.log(
    `\n**${apply ? "Added" : "Would add"} ~${totalAdd.toLocaleString("en-US")} rows (~${mb.toFixed(0)} MB at ${BYTES_PER_ROW} bytes/row incl. indexes). ` +
      `${nothingToAdd} already complete, ${refused} refused by the identity check, ${failed} failed.**`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
