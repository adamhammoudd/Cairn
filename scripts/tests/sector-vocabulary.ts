// The news tagger and the app must agree on what a sector is called.
//
// They did not: the tagger writes lowercase slugs onto news_items.sectors and
// the app compared them to whatever free text a user typed into a holding, as
// raw strings. "Technology" never matched "technology". This suite pins the
// reconciliation from both directions - every slug the tagger can emit is
// known to lib/sectors.ts, and the normaliser actually collapses the ways
// people write these words.
//
// Run: npx tsx scripts/tests/sector-vocabulary.ts

import { SECTOR_KEYWORDS } from "../../supabase/functions/_shared/tagging";
import { SECTOR_SLUGS, normalizeSector, normalizeSectorsForMatching } from "../../src/lib/sectors";
import { writeReport, type SuiteResult, type TestCase } from "./report";

// Sectors the tagger attaches through its per-ticker table rather than through
// SECTOR_KEYWORDS - both routes write to the same column, so both are checked.
const TICKER_TABLE_SLUGS = ["technology", "semiconductors", "automotive", "retail"];

const PHRASINGS: [string, string][] = [
  ["Technology", "technology"],
  ["tech", "technology"],
  ["Information Technology", "technology"],
  ["Semis", "semiconductors"],
  ["semiconductor", "semiconductors"],
  ["Consumer Discretionary", "retail"],
  ["E-Commerce", "retail"],
  ["e commerce", "retail"],
  ["Electric Vehicles", "automotive"],
  ["Crypto", "crypto"],
  ["digital assets", "crypto"],
  ["Interest Rates", "macro"],
  ["Oil & Gas", "energy"],
  ["Aerospace & Defence", "industrials"],
  ["real-estate", "real_estate"],
  ["REITs", "real_estate"],
];

export function runSectorVocabularySuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, passed: boolean, detail: string) =>
    cases.push({ name, status: passed ? "pass" : "fail", detail });

  // 1. Every slug the tagger can emit is known to the app.
  for (const slug of new Set([...Object.keys(SECTOR_KEYWORDS), ...TICKER_TABLE_SLUGS])) {
    const known = SECTOR_SLUGS.includes(slug);
    check(`tagger slug "${slug}" is in the app vocabulary`, known, known ? "known" : `lib/sectors.ts does not define "${slug}"`);
  }

  // 2. The normaliser collapses real user phrasings onto those slugs.
  for (const [input, expected] of PHRASINGS) {
    const got = normalizeSector(input);
    check(`"${input}" normalises to ${expected}`, got === expected, `got ${got ?? "null"}`);
  }

  // 3. Unrecognised text is NOT forced into the nearest slug. A holding tagged
  //    "Shipping" must not silently become "Industrials".
  for (const input of ["Shipping", "Agriculture", "zzz"]) {
    const got = normalizeSector(input);
    check(`"${input}" is left unrecognised`, got === null, `got ${got ?? "null"}`);
  }

  // 4. But two holdings written the same unrecognised way still match.
  const a = normalizeSectorsForMatching(["Shipping"]);
  const b = normalizeSectorsForMatching(["shipping"]);
  const overlap = [...a].some((x) => b.has(x));
  check("unrecognised sectors still match each other", overlap, overlap ? "matched on raw key" : "no overlap");

  // 5. Blank input is not a match-anything wildcard.
  const empties = normalizeSectorsForMatching([null, undefined, "", "   "]);
  check("blank sectors produce no match keys", empties.size === 0, `${empties.size} keys`);

  return {
    suiteName: "sector-vocabulary",
    // Gating: a tagger slug the app does not know is a silently broken filter,
    // which is exactly the failure this suite exists to catch.
    gating: true,
    cases,
  };
}

// Direct invocation prints the per-case result rather than a bare count.
if (process.argv[1]?.endsWith("sector-vocabulary.ts")) {
  const suite = runSectorVocabularySuite();
  for (const c of suite.cases) {
    console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name}${c.status === "pass" ? "" : ` - ${c.detail}`}`);
  }
  const failed = suite.cases.filter((c) => c.status !== "pass");
  console.log(`\n${suite.cases.length - failed.length}/${suite.cases.length} passed`);
  writeReport([suite]);
  if (failed.length > 0) process.exitCode = 1;
}
