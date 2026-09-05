// Item 4 of the 2026-09-05 fix sweep: "One portfolio holding (ISRG) is
// missing sector/country data." Portfolio > Sector and > Geography both
// dumped Intuitive Surgical (ISRG) into "Unclassified" alongside BTC - but
// BTC belongs there (crypto has no SEC sector/country) and ISRG doesn't.
//
// Root cause: `sector`/`geography` on `holdings` are plain free-text fields
// the Edit-asset modal lets someone type in (see holding-modal.tsx) - there
// is no ingest/fetch that auto-populates them from a provider, so "missing"
// here just means nobody typed a value in for that holding, not a fetch that
// silently failed. Live check against the real account found a SECOND
// holding with the exact same gap that the task didn't name: MSFT (also
// equity, also missing both fields) - not called out in the original report,
// found by the "check every OTHER held symbol" sweep this asked for.
//
// Since there's no automated source to backfill from, this is a read-only
// check (same "one-off check, re-run after the fix" shape as item 2's crypto
// sweep) - it flags every non-crypto holding missing sector/geography.
// Crypto is legitimately exempt (no SEC sector, no incorporation country).
//
// Run: npx tsx --conditions=react-server scripts/tests/holding-metadata-gaps.ts
import "./env";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const admin = createAdminClient();
  const { data: holdings, error } = await admin
    .from("holdings")
    .select("symbol, asset_type, sector, geography, user_id");

  if (error) {
    console.error(`FAIL  could not read holdings: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const rows = holdings ?? [];
  // Crypto has no SEC sector or country of incorporation - "Unclassified" is
  // the correct, honest answer for it, not a gap.
  const gaps = rows.filter((h) => h.asset_type !== "crypto" && (h.sector === null || h.geography === null));

  if (gaps.length === 0) {
    console.log("pass  every non-crypto holding has both sector and geography set");
  } else {
    console.log(`FAIL  ${gaps.length} non-crypto holding(s) missing sector and/or geography:`);
    for (const h of gaps) {
      console.log(`      ${h.symbol} (${h.asset_type}): sector=${h.sector ?? "null"}, geography=${h.geography ?? "null"}`);
    }
    console.log("      These are free-text fields nobody has auto-populated - fill in via the Edit-asset modal,");
    console.log("      e.g. ISRG -> \"Health Care\" / \"USA\", MSFT -> \"Technology\" / \"USA\" (matching NVDA's existing values).");
  }

  console.log(`\n${gaps.length > 0 ? "FAIL" : "pass"} - holding-metadata-gaps`);
  // process.exitCode (not process.exit()) - see crypto-asset-type-mismatches.ts
  // for why: process.exit() here raced the admin client's cleanup handles.
  if (gaps.length > 0) process.exitCode = 1;
}

main();
