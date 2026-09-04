// Tests for src/lib/export-csv.ts.
//
// Regression target (audit 2026-09-04, finding #11): the account CSV export had
// no formula-injection guard. A free-text field the user controls (a watchlist
// name, a goal name) beginning with = + - @ is evaluated as a formula when the
// file is opened in Excel / Sheets / LibreOffice.
//
// Run: npx tsx --conditions=react-server scripts/tests/export-csv.ts

import { datasetToCsv, exportToCsv } from "../../src/lib/export-csv";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- formula-injection payloads are neutralised --------------------------
for (const payload of [
  "=1+1",
  "=cmd|'/C calc'!A0",
  "+1+1",
  "@SUM(A1:A9)",
  "-2+3+cmd|'/C calc'!A0",
  "\t=1+1",
  "\r=1+1",
]) {
  const csv = datasetToCsv([{ name: payload }]);
  const cell = csv.split("\n")[1];
  const bare = cell.replace(/^"|"$/g, "").replace(/""/g, '"');
  check(`payload ${JSON.stringify(payload)} is prefixed with '`, bare.startsWith("'"), JSON.stringify(cell));
}

// --- legitimate values are untouched -----------------------------------
{
  const csv = datasetToCsv([
    { symbol: "AAPL", gainPct: -11.24, change: "+3.2", qty: 10, note: "up 2% today" },
  ]);
  const row = csv.split("\n")[1];
  check("negative number stays numeric (no quote prefix)", row.includes("-11.24") && !row.includes("'-11.24"), row);
  check("plus-number stays numeric", row.includes("+3.2") && !row.includes("'+3.2"), row);
  check("plain text is unchanged", row.includes("up 2% today"), row);
}

// --- RFC 4180 quoting still applies on top of the guard ----------------
{
  const csv = datasetToCsv([{ name: "=HYPERLINK(0,0), drop" }]);
  const cell = csv.split("\n")[1];
  check("payload with a comma is quoted AND prefixed", cell.startsWith('"\'=HYPERLINK'), cell);
}

// --- exportToCsv end to end -------------------------------------------
{
  const out = exportToCsv({ watchlists: [{ name: "=2+5+cmd" }] });
  check("exportToCsv neutralises nested payloads", out.includes("'=2+5+cmd"), out);
}

console.log(`\n${pass}/${pass + fail} export-csv cases passed`);
process.exit(fail === 0 ? 0 : 1);
