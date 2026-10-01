// Regression test for chore/waitlist-beta-copy: the waitlist said the product
// was "In development" / "Not yet launched" after the closed beta opened.
// Source check over both waitlist pages and /welcome.
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
  // feat/front-door-design: the header read "Beta open · Waitlist open" - a
  // beta that is open beside a waitlist you still have to join. The pages now
  // say what actually happens next, and nothing implies instant access.
  const form = read("src/app/waitlist/waitlist-form.tsx");
  const welcome = read("src/app/welcome/page.tsx");
  const view = read("src/app/waitlist/confirm/confirm-view.tsx");
  const next = /We invite people in batches, in the order they joined\.\s+You(?:&apos;|')ll get an\s+email with your\s+personal link\./;
  for (const [name, src] of [["/waitlist", page + form], ["/waitlist/confirm", view], ["/welcome", welcome]] as const) {
    check(`${name}: no self-contradicting "Beta open" status`, !/Beta open|Beta now open/.test(src), "removed");
    check(`${name}: says what happens next`, next.test(src), "batches, in order, personal link by email");
    check(`${name}: no instant-access wording`, !/Free to start|no card required|start now|instant access/i.test(src), "none");
  }
  return { suiteName: "Waitlist beta status copy", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const suite = runWaitlistBetaCopySuite();
  writeReport([suite]);
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}
