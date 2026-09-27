// Every suite in scripts/tests is wired into run-all.
//
// Squash merges of branches that each added one suite to run-all.ts kept only
// the last branch's lines: #149 replaced split-adjustment's with health-inputs,
// #150 replaced that import with portfolio-history-read, and #151 replaced
// both with calendar-ingest - three gating suites stopped running, and main
// stopped type-checking, with no failing test to say so. This suite is that
// test: a suite file whose runner run-all.ts neither imports nor calls fails
// here.
//
// Run: npx tsx --conditions=react-server scripts/tests/run-all-registration.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const DIR = path.dirname(fileURLToPath(import.meta.url));

export function runRunAllRegistrationSuite(): SuiteResult {
  const runAll = fs.readFileSync(path.join(DIR, "run-all.ts"), "utf8");
  const cases: TestCase[] = [];
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".ts") && f !== "run-all.ts").sort()) {
    const src = fs.readFileSync(path.join(DIR, file), "utf8");
    for (const m of src.matchAll(/export (?:async )?function (run[A-Za-z0-9]+Suites?)\(/g)) {
      const name = m[1];
      const imported = new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "\\./${file.replace(/\.ts$/, "")}"`).test(runAll);
      const used = new RegExp(`\\b${name}\\b(?!\\s*\\}\\s*from)`).test(runAll.replace(/^import .*$/gm, ""));
      cases.push({
        name: `${file}: ${name} is imported and run by run-all`,
        status: imported && used ? "pass" : "fail",
        detail: imported && used ? "registered" : `${imported ? "" : "not imported"}${!imported && !used ? "; " : ""}${used ? "" : "never run"}`,
      });
    }
  }
  // A guarded(...) call whose result is never spread into allSuites runs the
  // suite and throws its result away: nothing fails, nothing is reported
  // (fix/analysis-failure-reasons added suites that way before this check).
  // There must be one destructured name per guarded call, each spread into
  // allSuites.
  const destructured = runAll.match(/const \[([\s\S]*?)\] = await Promise\.all\(\[([\s\S]*?)\]\);/);
  if (!destructured) {
    cases.push({ name: "run-all destructures its guarded suites", status: "fail", detail: "pattern not found" });
  } else {
    const names = destructured[1].split(",").map((n) => n.trim()).filter(Boolean);
    const calls = (destructured[2].match(/\bguarded\(/g) ?? []).length;
    cases.push({ name: "every guarded(...) call has a named result", status: names.length === calls ? "pass" : "fail", detail: `${names.length} names for ${calls} guarded calls` });
    const all = runAll.slice(runAll.indexOf("const allSuites"));
    for (const n of names) {
      const spread = new RegExp(`\\.\\.\\.${n}\\b`).test(all);
      cases.push({ name: `run-all reports ${n}`, status: spread ? "pass" : "fail", detail: spread ? "in allSuites" : "result discarded: not spread into allSuites" });
    }
  }
  return { suiteName: "Every test suite is registered in run-all", gating: true, cases };
}

async function main() {
  const suite = runRunAllRegistrationSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
