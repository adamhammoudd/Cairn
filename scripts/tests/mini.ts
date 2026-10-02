// Tiny harness for suites written as plain check() calls: collects cases for
// run-all's SuiteResult and, when the file is run directly, prints them and sets
// the exit code. Keeps new suites registered in run-all without each one
// re-implementing the pass/fail bookkeeping.
import { pathToFileURL } from "node:url";
import type { SuiteResult, TestCase } from "./report";

export function makeSuite(suiteName: string) {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail = "") => void cases.push({ name, status: ok ? "pass" : "fail", detail });
  const eq = (name: string, got: unknown, want: unknown) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const result = (): SuiteResult => ({ suiteName, gating: true, cases });
  return { check, eq, result };
}

/** Run `suite` and exit non-zero on failure - only when `meta` is the entry file. */
export async function runIfMain(metaUrl: string, suite: () => Promise<SuiteResult> | SuiteResult) {
  if (metaUrl !== pathToFileURL(process.argv[1]).href) return;
  const r = await suite();
  for (const c of r.cases) console.log(`${c.status === "pass" ? "pass" : "FAIL"}  ${c.name}${c.detail ? ` - ${c.detail}` : ""}`);
  const failed = r.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${r.cases.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
