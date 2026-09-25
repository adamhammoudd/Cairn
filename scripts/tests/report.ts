// Shared report format for Section 7's three checks - one readable Markdown
// file with pass/fail per test and the actual output attached for anything
// that failed, per the spec ("not a bare pass count").
import fs from "node:fs";
import path from "node:path";

export type CaseStatus = "pass" | "fail" | "flag" | "skip";

export interface TestCase {
  name: string;
  status: CaseStatus;
  detail: string;
  /** Full raw output/row attached for anything that failed or was flagged. */
  attachment?: string;
}

export interface SuiteResult {
  suiteName: string;
  /** Whether this suite's failures are gating (zero-tolerance) or advisory. */
  gating: boolean;
  cases: TestCase[];
  /** Top-level notes, e.g. "skipped - self-hosted inference server unreachable". */
  notes?: string[];
}

export type SuiteVerdict = "pass" | "fail" | "incomplete";

/**
 * A gating suite passes only if it actually ran something and nothing failed.
 *
 * The previous implementation was `cases.every(c => pass || skip)`, which
 * returns true for an empty array -- so a suite that executed zero tests was
 * reported as passing, and `run-all` rolled it into "All gating suites
 * passed." Three of five suites were in that state: the live scope-guard tier
 * with no model server, and both suites that need analyses to exist when
 * ai_analyses had no rows. A suite that did not run is not a suite that
 * passed, so it now reports `incomplete` and is non-passing.
 */
export function suiteVerdict(suite: SuiteResult): SuiteVerdict {
  const failed = suite.cases.some((c) => c.status === "fail");
  const executed = suite.cases.filter((c) => c.status === "pass" || c.status === "fail").length;

  if (!suite.gating) return failed ? "fail" : "pass";
  if (failed) return "fail";
  if (executed === 0) return "incomplete";
  if (suite.cases.some((c) => c.status === "skip")) return "incomplete";
  return "pass";
}

function renderCase(c: TestCase): string {
  const icon = { pass: "PASS", fail: "FAIL", flag: "FLAG", skip: "SKIP" }[c.status];
  let out = `- **[${icon}]** ${c.name} - ${c.detail}`;
  if (c.attachment && (c.status === "fail" || c.status === "flag")) {
    out += `\n\n  \`\`\`\n  ${c.attachment.replace(/\n/g, "\n  ")}\n  \`\`\``;
  }
  return out;
}

export function renderMarkdown(suites: SuiteResult[]): string {
  const lines: string[] = [];
  lines.push(`# Cairn AI Assistant - Test Report`);
  lines.push(`Generated ${new Date().toISOString()}`);
  lines.push("");

  for (const suite of suites) {
    const passCount = suite.cases.filter((c) => c.status === "pass").length;
    const failCount = suite.cases.filter((c) => c.status === "fail").length;
    const flagCount = suite.cases.filter((c) => c.status === "flag").length;
    const skipCount = suite.cases.filter((c) => c.status === "skip").length;
    const overall = suiteVerdict(suite).toUpperCase();

    lines.push(`## ${suite.suiteName} - ${overall} (${suite.gating ? "gating" : "advisory"})`);
    lines.push(
      `${passCount} passed, ${failCount} failed, ${flagCount} flagged for review, ${skipCount} skipped, ${suite.cases.length} total.`,
    );
    if (suite.notes && suite.notes.length > 0) {
      lines.push("");
      for (const note of suite.notes) lines.push(`> ${note}`);
    }
    lines.push("");
    for (const c of suite.cases) lines.push(renderCase(c));
    lines.push("");
  }

  return lines.join("\n");
}

export function writeReport(suites: SuiteResult[]): string {
  const dir = path.resolve(process.cwd(), "scripts/tests/report");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  fs.writeFileSync(file, renderMarkdown(suites), "utf8");
  return file;
}
