// Audit 2026-09-04 (medium): the Portfolio page built the holdings-table
// sparklines by re-scanning the entire priceRows array once per held symbol,
// even though the same bars were already grouped by symbol two lines earlier
// (barsBySymbol, for the quote reads).
//
// Structural regression lock: the sparkline loop must read barsBySymbol, not
// re-filter priceRows.
//
// Run: npx tsx --conditions=react-server scripts/tests/portfolio-sparkline-reuse.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(import.meta.dirname, "..", "..", "src/app/(app)/portfolio/page.tsx"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const loop = page.slice(page.indexOf("const sparklines"), page.indexOf("const sparklines") + 320);

check("sparklines reuse the grouped barsBySymbol map", /barsBySymbol\.get\(symbol\)/.test(loop));
check(
  "sparklines no longer re-scan priceRows per symbol",
  !/priceRows\s*\.filter\(\(p\)\s*=>\s*p\.symbol === symbol/.test(loop),
  "still O(symbols x priceRows)",
);
check("still oldest-first (reverse applied to the newest-first group)", /\.slice\(0,\s*30\)\s*\.reverse\(\)/.test(loop));

console.log(`\n${pass}/${pass + fail} sparkline-reuse checks passed`);
process.exit(fail === 0 ? 0 : 1);
