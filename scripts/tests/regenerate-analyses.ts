// Section 4 (chore/regenerate-analyses): regenerating the stored analyses is
// safe to run as a dry run and never deletes anything.
//
//   * the dry run has no write path: every write in the script sits behind
//     --apply, which also refuses to run until migrations 0052/0054 are live;
//   * old rows are marked superseded (0054), not deleted;
//   * every list reader hides superseded rows; a chat citation by id still
//     resolves one, so old conversations keep their evidence.
//
// Run: npx tsx --conditions=react-server scripts/tests/regenerate-analyses.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

export function runRegenerateAnalysesSuite(): SuiteResult {
  const out: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, status: ok ? "pass" : "fail", detail });

  // Comments stripped (line-for-line, so positions still mean code).
  const script = read("scripts/regenerate-analyses.ts").replace(/^\s*\/\/.*$/gm, "");
  const dryBranch = script.indexOf("if (!apply) {");
  const dryEnd = script.indexOf("continue;\n    }\n\n    const { generateAnalysis }", dryBranch);
  const writes = [...script.matchAll(/\.(insert|update|upsert|delete)\(|generateAnalysis\(/g)].map((m) => m.index ?? 0);
  check("dry run: every write in the script comes after the dry-run branch has returned", dryBranch > 0 && dryEnd > dryBranch && writes.length > 0 && writes.every((i) => i > dryEnd), `dry branch ${dryBranch}-${dryEnd}, writes at ${writes.join(",")}`);
  check("dry run never calls analyzeFactors (it upserts rows); it uses the no-write dry-run pipeline", !/analyzeFactors/.test(script) && /dryRunTicker/.test(script) && !/analyzeFactors\(/.test(read("scripts/analysis-dry-run.ts")), "no upsert path");
  check("--apply refuses to run before migrations 0052 and 0054 are live", /Refusing --apply: migrations 0052 and 0054/.test(script) && /select\("headline, superseded_by"\)/.test(script), "probe first");
  check("old rows are marked superseded, never deleted", /superseded_by: fresh\.id/.test(script) && !/\.delete\(/.test(script), "no delete");

  const mig = read("supabase/migrations/0054_superseded_analyses.sql");
  check("0054 adds superseded_by/at and deletes nothing", /add column if not exists superseded_by uuid/.test(mig) && /superseded_at timestamptz/.test(mig) && !/\bdelete\b|\bdrop table\b/i.test(mig.replace(/on delete set null/g, "").replace(/^--.*$/gm, "")), "additive");

  for (const f of ["src/lib/actions/analysis.ts", "src/lib/ai/briefing.ts", "src/lib/ai/context.ts", "src/app/(app)/page.tsx", "supabase/functions/generate-daily-briefings/index.ts", "supabase/functions/evaluate-alerts/index.ts"]) {
    const s = read(f);
    const lists = (s.match(/\.eq\("status", "validated"\)\s*\n\s*(?:\/\/[^\n]*\n\s*)?\.is\("superseded_by", null\)/g) ?? []).length;
    const byId = (s.match(/\.in\("id", ids\)\.eq\("status", "validated"\)/g) ?? []).length;
    const all = (s.match(/\.eq\("status", "validated"\)/g) ?? []).length;
    check(`${f}: every list read hides superseded analyses`, lists > 0 && lists + byId === all, `${lists} filtered, ${byId} by id, ${all} total`);
  }
  const byIdLine = read("src/lib/actions/analysis.ts").match(/from\("ai_analyses"\)\.select\(ANALYSIS_COLUMNS\)\.in\("id", ids\)[^;]*;/)?.[0] ?? "";
  check("chat citations by id still resolve a superseded analysis (old conversations keep their evidence)", byIdLine.length > 0 && !byIdLine.includes("superseded_by"), byIdLine);

  return { suiteName: "Regenerating stored analyses (dry run first, supersede not delete)", gating: true, cases: out };
}

async function main() {
  const suite = runRegenerateAnalysesSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
