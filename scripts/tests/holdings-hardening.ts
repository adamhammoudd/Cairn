// Audit 2026-09-04 (high-priority, by area, Portfolio):
//  - `asset_type` on a new/edited holding was trusted from the form with no
//    validation against the allowed set - a raw POST could write a bogus value
//    that breaks the ticker page's stat-grid routing.
//  - Deleting a holding threw on error instead of showing the inline message
//    every other mutation on the page shows.
//
// Run: npx tsx --conditions=react-server scripts/tests/holdings-hardening.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidAssetType, ASSET_TYPE_VALUES } from "../../src/lib/validation";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- asset_type validation ------------------------------------------
for (const t of ASSET_TYPE_VALUES) check(`"${t}" is accepted`, isValidAssetType(t));
for (const bad of ["", "stock", "EQUITY", "bond", "crypto ", null, undefined, 42, {}]) {
  check(`${JSON.stringify(bad)} is rejected`, !isValidAssetType(bad));
}
check("the value set matches the AssetType union in supabase/types.ts", (() => {
  const types = readFileSync(join(import.meta.dirname, "..", "..", "src/lib/supabase/types.ts"), "utf8");
  const m = types.match(/export type AssetType =([^;]+);/);
  if (!m) return false;
  const union = m[1].split("|").map((s) => s.trim().replace(/["']/g, "")).sort();
  return JSON.stringify(union) === JSON.stringify([...ASSET_TYPE_VALUES].sort());
})());

// --- the action + component wiring ---------------------------------
const ROOT = join(import.meta.dirname, "..", "..");
const action = readFileSync(join(ROOT, "src/lib/actions/holdings.ts"), "utf8");
check("parseHoldingForm validates asset_type", /isValidAssetType\(asset_type\)/.test(action));
check(
  "deleteHolding returns the error instead of throwing",
  /if \(error\) return error\.message/.test(action) && !/if \(error\) throw new Error/.test(action),
);

const table = readFileSync(join(ROOT, "src/components/portfolio/holdings-table.tsx"), "utf8");
check("holdings-table captures the delete error into state", /setDeleteError\(/.test(table));
check("holdings-table renders the delete error", /deleteError &&/.test(table));
check(
  "both delete buttons route through the shared handler",
  (table.match(/handleDelete\(m\.symbol, m\.id\)/g) ?? []).length === 2 && !/startDelete\(\(\) => deleteHolding/.test(table),
);

console.log(`\n${pass}/${pass + fail} holdings-hardening cases passed`);
process.exit(fail === 0 ? 0 : 1);
