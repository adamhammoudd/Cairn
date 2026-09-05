// The 2026-09-05 UI pass, section 1: "one uppercase pill-badge component for
// asset type, used identically on Markets, Screener, Portfolio and Comparison
// - audit found this currently rendering lowercase in some places and
// uppercase in others; fix at the component level so it can't drift again."
//
// Before: four hand-rolled renderings - Markets/Comparison drew the full pill,
// the Screener drew mono uppercase text with only the text colour, the Ticker
// page hard-coded `text-muted`/`border-line` (so crypto never went violet),
// and the Portfolio holdings table printed the raw value with `capitalize`
// and no pill at all.
//
// This locks in the shared component: every surface must import AssetTypeBadge
// and no surface may re-introduce an inline asset-type tag. The unit half
// checks the badge itself uppercases in CSS (never mutating the stored value)
// and sources its per-type colour from ASSET_TYPE_TAG_CLASS.
//
// Run: npx tsx --conditions=react-server scripts/tests/asset-type-badge-consistency.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASSET_TYPE_TAG_CLASS } from "@/lib/screener";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// --- 1. every asset-type surface goes through the shared component ----------
const SURFACES = [
  "src/components/markets/ticker-list.tsx",
  "src/components/screener/screener-panel.tsx",
  "src/components/portfolio/holdings-table.tsx",
  "src/components/comparison/comparison-table.tsx",
  "src/components/ticker/ticker-workspace.tsx",
];
for (const file of SURFACES) {
  const src = read(file);
  check(`${file} imports AssetTypeBadge`, /AssetTypeBadge/.test(src));
  check(
    `${file} has no inline "rounded-full ... uppercase" asset-type pill`,
    !/rounded-full border[^`"']*uppercase[^`"']*ASSET_TYPE_TAG_CLASS/.test(src.replace(/\s+/g, " ")),
    "inline pill still present",
  );
  check(
    `${file} no longer prints a "capitalize" asset_type caption`,
    !/capitalize[^`"']*\{[^}]*asset_?[tT]ype\}/.test(src),
    "lowercase capitalize caption still present",
  );
}

// --- 2. the badge itself ---------------------------------------------------
const badge = read("src/components/asset-type-badge.tsx");
check("badge uppercases in CSS, not by mutating the string", /uppercase/.test(badge) && !/toUpperCase\(\)/.test(badge));
check("badge sources per-type colour from ASSET_TYPE_TAG_CLASS", /ASSET_TYPE_TAG_CLASS/.test(badge));
check("ASSET_TYPE_TAG_CLASS still covers every real asset type", ["equity", "etf", "crypto", "forex", "index"].every((t) => t in ASSET_TYPE_TAG_CLASS));

console.log(`\n${pass}/${pass + fail} asset-type-badge-consistency cases passed`);
process.exit(fail === 0 ? 0 : 1);
