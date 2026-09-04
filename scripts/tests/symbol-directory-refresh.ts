// Regression test for supabase/functions/_shared/symbol-directory.ts.
//
// Root cause (2026-09-04 live walkthrough, finding #1): ingest-market-data's
// configured-provider loop and ingest-crypto both wrote fresh data to
// historical_prices/crypto_metrics every run but never touched
// symbol_directory - only the on-demand ("searched for") path did. Live check
// against the real DB: 64 of 75 symbol_directory rows were >24h stale by
// last_checked_at while the equities' historical_prices were current as of
// yesterday, and BTC's directory row was stuck at 2026-08-23 (12 days) despite
// ingest-crypto running every 2 hours. buildDirectoryPatch is the one place
// that now decides what an ingest attempt writes back to the directory, so
// this covers the mapping without a live Supabase call.
//
// Run: npx tsx --conditions=react-server scripts/tests/symbol-directory-refresh.ts

import { buildDirectoryPatch } from "../../supabase/functions/_shared/symbol-directory";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const NOW = "2026-09-04T12:00:00.000Z";

// --- 1. Success with a known bar count (ingest-market-data's configured loop) --
{
  const patch = buildDirectoryPatch({ kind: "success", bars: 520 }, NOW);
  check("success: status available", patch.status === "available", patch.status);
  check("success: bars carried through", patch.bars === 520, String(patch.bars));
  check("success: detail cleared", patch.detail === null, String(patch.detail));
  check("success: last_checked_at bumped", patch.last_checked_at === NOW);
  check("success: last_success_at bumped too", patch.last_success_at === NOW);
}

// --- 2. Success with no bar count (ingest-crypto's metrics pass) -------------
// This is the case that fixes BTC: the metrics pass touches every tracked
// coin every run, but doesn't itself count daily bars, so `bars` must be
// left out of the patch entirely rather than zeroing out a real count.
{
  const patch = buildDirectoryPatch({ kind: "success" }, NOW);
  check("success/no-bars: status available", patch.status === "available");
  check("success/no-bars: bars key omitted, not zeroed", !("bars" in patch), JSON.stringify(patch));
  check("success/no-bars: last_checked_at bumped", patch.last_checked_at === NOW);
  check("success/no-bars: last_success_at bumped", patch.last_success_at === NOW);
}

// --- 3. Provider returned nothing this attempt --------------------------------
{
  const patch = buildDirectoryPatch({ kind: "no_data" }, NOW);
  check("no_data: status unavailable", patch.status === "unavailable", patch.status);
  check("no_data: detail explains why", patch.detail === "no data returned");
  check("no_data: last_checked_at still bumped (an attempt happened)", patch.last_checked_at === NOW);
  check("no_data: last_success_at NOT set", patch.last_success_at === undefined);
  check("no_data: bars NOT touched", !("bars" in patch));
}

// --- 4. Transport/parse failure ------------------------------------------------
{
  const patch = buildDirectoryPatch({ kind: "error", message: "fetch failed: 429" }, NOW);
  check("error: status error", patch.status === "error", patch.status);
  check("error: detail carries the real message", patch.detail === "fetch failed: 429", String(patch.detail));
  check("error: last_checked_at still bumped", patch.last_checked_at === NOW);
  check("error: last_success_at NOT set (a failure must not look like a success)", patch.last_success_at === undefined);
}

// --- 5. A run of failures never fabricates a success ---------------------------
{
  const failure = buildDirectoryPatch({ kind: "error", message: "timeout" }, NOW);
  const noData = buildDirectoryPatch({ kind: "no_data" }, NOW);
  check(
    "neither failure path ever sets last_success_at",
    failure.last_success_at === undefined && noData.last_success_at === undefined,
  );
}

console.log(`\n${pass}/${pass + fail} symbol-directory-refresh cases passed`);
process.exit(fail === 0 ? 0 : 1);
