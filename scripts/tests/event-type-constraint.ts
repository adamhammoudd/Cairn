// Every historical_events.event_type the app writes is allowed by the table's
// check constraint.
//
// feat/analysis-baseline (#164) started writing "price_window" rows for the
// base rate, but historical_events_event_type_check (last rewritten in 0046)
// only allowed the types that existed then. Every ticker analysis on an
// ordinary day failed in production with "violates check constraint
// historical_events_event_type_check". No test wrote to the database, so
// nothing caught it. This one reads the newest migration that defines the
// constraint and checks each event type the code inserts is in it.
//
// Run: npx tsx --conditions=react-server scripts/tests/event-type-constraint.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BASELINE_EVENT_TYPE, EARNINGS_WINDOW_EVENT_TYPE, FACTOR_EVENT_TYPE } from "@/lib/ai/factor-analysis";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The allowed list from the last migration (by number) that adds the constraint. */
export function latestAllowedEventTypes(): { migration: string; types: string[] } | null {
  const dir = path.join(ROOT, "supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let found: { migration: string; types: string[] } | null = null;
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const m = sql.match(/add constraint historical_events_event_type_check\s+check \(event_type in \(([^)]*)\)\)/i);
    if (m) found = { migration: f, types: [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) };
  }
  return found;
}

export function runEventTypeConstraintSuite(): SuiteResult {
  const out: TestCase[] = [];
  const allowed = latestAllowedEventTypes();
  out.push({ name: "a migration defines historical_events_event_type_check", status: allowed ? "pass" : "fail", detail: allowed?.migration ?? "none found" });
  // Types the Next.js app inserts. The Edge Functions' types (earnings,
  // dividend, split, volatility_regime...) predate this and are covered by the
  // same list.
  for (const t of [FACTOR_EVENT_TYPE, BASELINE_EVENT_TYPE, EARNINGS_WINDOW_EVENT_TYPE, "earnings"]) {
    const ok = !!allowed?.types.includes(t);
    out.push({ name: `event_type "${t}" is allowed by the constraint`, status: ok ? "pass" : "fail", detail: ok ? `in ${allowed?.migration}` : `missing from ${allowed?.migration}: ${allowed?.types.join(", ")}` });
  }
  return { suiteName: "historical_events event types match the check constraint", gating: true, cases: out };
}

async function main() {
  const suite = runEventTypeConstraintSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
