// Regression test for chore/waitlist-beta-copy: the waitlist said the product
// was "In development" / "Not yet launched" after the closed beta opened.
// Source check over both waitlist pages.
//
// Run: npx tsx --conditions=react-server scripts/tests/waitlist-beta-copy.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

export function runWaitlistBetaCopySuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });
  const page = read("src/app/waitlist/page.tsx");
  const confirm = read("src/app/waitlist/confirm/page.tsx");
  for (const [name, src] of [["/waitlist", page], ["/waitlist/confirm", confirm]] as const) {
    const stale = ["In development", "Not yet launched"].filter((s) => src.includes(s));
    check(`${name}: no pre-beta status copy`, stale.length === 0, stale.join(", ") || "none");
  }
  check('/waitlist header label reads "Beta open"', />\s*Beta open\s*</.test(page), "header label");
  check('/waitlist hero badge reads "Beta now open"', page.includes("Beta now open"), "hero badge");
  check('/waitlist/confirm header reads "Beta open · Waitlist open"', confirm.includes("Beta open · Waitlist open"), "confirm header");
  return { suiteName: "Waitlist beta status copy", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const suite = runWaitlistBetaCopySuite();
  writeReport([suite]);
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}
