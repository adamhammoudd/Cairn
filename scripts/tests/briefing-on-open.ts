// Regression test for fix/briefing-on-open.
//
// The hourly generate-daily-briefings job missed days: live on 2026-09-26,
// daily_briefings had no row for 2026-09-25 for either account, and none for
// 2026-09-24 for one of them (the 12:00 UTC run's first query got a transient
// 401). getTodayBriefing() only read the stored row, so the Assistant page
// showed "No briefing yet today" until the reader pressed Generate. It now
// builds the briefing when there is none (storedOrBuiltBriefing).
//
// Run: npx tsx --conditions=react-server scripts/tests/briefing-on-open.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { storedOrBuiltBriefing, type BriefingContent } from "@/lib/ai/briefing";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const here = path.dirname(fileURLToPath(import.meta.url));
const built = { generatedAt: "2026-09-26T12:00:00Z" } as unknown as BriefingContent;
const stored = { generatedAt: "2026-09-26T08:00:00Z" } as unknown as BriefingContent;

export async function runBriefingOnOpenSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  let builds = 0;
  const build = async () => {
    builds++;
    return built;
  };

  const none = await storedOrBuiltBriefing(null, build);
  check("no briefing stored for today: one is built on open", none === built && builds === 1, `builds=${builds}`);

  builds = 0;
  const kept = await storedOrBuiltBriefing({ content: stored }, build);
  check("a stored briefing is returned as-is, nothing rebuilt", kept === stored && builds === 0, `builds=${builds}`);

  builds = 0;
  const emptyRow = await storedOrBuiltBriefing({ content: null }, build);
  check("a row with no content counts as none", emptyRow === built && builds === 1, `builds=${builds}`);

  const origError = console.error;
  let logged = "";
  console.error = (...a: unknown[]) => {
    logged = a.map(String).join(" ");
  };
  const failed = await storedOrBuiltBriefing(null, async () => {
    throw new Error("PGRST303 JWT expired");
  });
  console.error = origError;
  check("a failed build falls back to the empty card and is logged", failed === null && /on-open generation failed/.test(logged), logged);

  // The page's read goes through the helper, not a bare stored-row read.
  const action = fs.readFileSync(path.join(here, "..", "..", "src", "lib", "actions", "briefing.ts"), "utf8");
  const body = /export async function getTodayBriefing\(\)[\s\S]*?\n}\n/.exec(action)?.[0] ?? "";
  check(
    "getTodayBriefing() builds through storedOrBuiltBriefing when nothing is stored",
    /storedOrBuiltBriefing\(data, \(\) => generateBriefing\(user\.id\)\)/.test(body),
    body.split("\n").slice(-4).join(" | "),
  );

  return { suiteName: "Daily briefing built on open", gating: true, cases };
}

async function main() {
  const suite = await runBriefingOnOpenSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
