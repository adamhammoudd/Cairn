// The coverage sweep's own logic (scripts/coverage-sweep.ts): the sample
// repeats for a seed, and a failure is called legitimate only when it is.
// The sweep itself needs the network and is a report; this suite is pure and
// gating, so the report cannot quietly start excusing real failures.
//
// Run: npx tsx --conditions=react-server scripts/tests/coverage-sweep-logic.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { judge, pick, rng, summarise, type SweepResult } from "../coverage-sweep";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const r = (over: Partial<SweepResult>): SweepResult => ({
  symbol: "X",
  stratum: "equity: large",
  status: "listed",
  ok: false,
  canonical: "X",
  bars: 1000,
  assetType: "equity",
  message: null,
  reasons: [],
  detail: null,
  legitimate: null,
  legitimacy: "",
  basis: null,
  fallback: null,
  news: null,
  dataSources: null,
  ms: 0,
  ...over,
});

export function runCoverageSweepLogicSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const items = Array.from({ length: 200 }, (_, i) => `S${i}`);
  const a = pick(items, 20, rng(20260927), (s) => s);
  const b = pick([...items].reverse(), 20, rng(20260927), (s) => s);
  cases.push(check("the same seed draws the same sample, whatever order the rows arrive in", a.join() === b.join(), a.slice(0, 5).join(",")));
  cases.push(check("a different seed draws a different sample", pick(items, 20, rng(1), (s) => s).join() !== a.join(), "seed 1 vs 20260927"));
  cases.push(check("no symbol is drawn twice", new Set(a).size === a.length, `${new Set(a).size}/${a.length}`));
  cases.push(check("asking for more than exist returns all of them", pick(items.slice(0, 3), 10, rng(5), (s) => s).length === 3, "3"));

  const young = judge(r({ bars: 4, message: "BLORB has only 4 trading days of price history" }));
  cases.push(check("under a year of prices: legitimate", young.legitimate === true && /only 4 days/.test(young.legitimacy), young.legitimacy));
  const missing = judge(r({ bars: 0, message: "We couldn't find market data for that ticker." }));
  cases.push(check("provider has no data: legitimate", missing.legitimate === true && /provider has no data/.test(missing.legitimacy), missing.legitimacy));
  for (const [what, msg, reasons] of [
    ["no news", "No recent news mentions Micron, so there's nothing to cite yet.", ["no_news"]],
    ["unusual setup", "Today's setup for AMD is unusual: it matched only 3 past moments, too few to measure.", ["unusual_setup"]],
    ["old generic wording", "Not enough historical data available for this scope yet", ["thin: no news"]],
    ["an error", "Something went wrong generating that analysis.", ["error"]],
  ] as const) {
    const j = judge(r({ bars: 1255, message: msg, reasons: [...reasons] }));
    cases.push(check(`${what} with 5 years of prices: NOT legitimate`, j.legitimate === false && /NOT legitimate/.test(j.legitimacy), j.legitimacy));
  }
  const busy = judge(r({ bars: 0, message: "the market-data provider is busy", reasons: ["ingest_rate_limited"] }));
  cases.push(check("a provider refusal with nothing stored is transient, never legitimate", busy.legitimate === false && /transient/.test(busy.legitimacy), busy.legitimacy));
  const ok = judge(r({ ok: true, bars: 1255 }));
  cases.push(check("an analysis is not a failure", ok.legitimate === null, ok.legitimacy));

  const s = summarise([
    r({ ok: true, bars: 1255 }),
    r({ ok: false, bars: 1255 }),
    r({ ok: false, bars: 10, stratum: "equity: small" }),
    r({ ok: true, bars: 500, stratum: "coin: top 100" }),
  ]);
  cases.push(check("the rate counts only symbols with a year or more of prices", s.total.withYear === 3 && s.total.okWithYear === 2 && Math.abs((s.total.rate ?? 0) - 2 / 3) < 1e-9, JSON.stringify(s.total)));
  cases.push(check("grouped by asset type", s.rows.map((x) => x.group).join(",") === "equity,coin", s.rows.map((x) => x.group).join(",")));

  const wf = fs.readFileSync(path.resolve(".github/workflows/coverage-sweep.yml"), "utf8");
  cases.push(check("CI runs the sweep as a non-gating report", /continue-on-error: true/.test(wf) && /scripts\/coverage-sweep\.ts/.test(wf) && /tsconfig\.readonly\.json/.test(wf), ".github/workflows/coverage-sweep.yml"));
  return { suiteName: "Coverage sweep logic (seeded sample, legitimacy)", gating: true, cases };
}

async function main() {
  const suite = runCoverageSweepLogicSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name}${c.status === "pass" ? "" : `\n      ${c.detail}`}`);
  console.log(`Report written to ${writeReport([suite])}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
