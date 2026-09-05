// Regression test for asset-type label consistency.
//
// The founder review flagged the same concept reading three ways across
// screens - a raw lowercase "equity", a `capitalize`d "Equity" (which also
// turned "etf" into "Etf"), and an `uppercase`d "EQUITY" pill. The fix routes
// every per-instance render through one map, assetTypeBadge().
//
// Run: npx tsx --conditions=react-server scripts/tests/asset-type-labels.ts

import { ASSET_TYPES, ASSET_TYPE_BADGE, ASSET_TYPE_LABEL, assetTypeBadge } from "@/lib/screener";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

// Every filterable asset type has an explicit badge label - no type falls
// through to the humanised fallback by accident.
for (const t of ASSET_TYPES) {
  check(`ASSET_TYPE_BADGE covers "${t}"`, t in ASSET_TYPE_BADGE, assetTypeBadge(t));
}

// The acronym cases the old `capitalize` class got wrong.
check('assetTypeBadge("etf") is "ETF", not "Etf"', assetTypeBadge("etf") === "ETF");

// Never a lowercase-initial or all-lowercase render.
for (const t of ASSET_TYPES) {
  const label = assetTypeBadge(t);
  check(`"${t}" badge is not the raw lowercase enum`, label !== t, label);
  check(`"${t}" badge starts uppercase`, /^[A-Z]/.test(label), label);
}

// Singular badge is distinct from the plural filter-tab wording where English
// pluralises - a row must not say "Equities".
check('badge "equity" ("Equity") differs from filter label ("Equities")', assetTypeBadge("equity") !== ASSET_TYPE_LABEL.equity);
check('badge "index" ("Index") differs from filter label ("Indices")', assetTypeBadge("index") !== ASSET_TYPE_LABEL.index);

// Unknown types humanise rather than crash or render raw.
check('assetTypeBadge("warrant") humanises to "Warrant"', assetTypeBadge("warrant") === "Warrant");

console.log(`\n${pass}/${pass + fail} asset-type-label cases passed`);
process.exit(fail === 0 ? 0 : 1);
