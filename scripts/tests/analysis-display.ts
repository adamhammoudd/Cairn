// Section 3 (feat/analysis-display-v2): one look everywhere, and Free vs
// Premium enforced on the server.
//
//   * the payload: a Free display carries no per-case dates/moves and no
//     trader figures (the >=5% band, factor readings) - dropped before
//     serialisation, not hidden;
//   * the database: migration 0053 closes the tables that carry Premium
//     content to anon/authenticated, and every app read of them uses the
//     service role;
//   * the render (child process, the real component): section order, free vs
//     premium, model vs template text, coin and fund, holding vs not.
//
// Run: npx tsx --conditions=react-server scripts/tests/analysis-display.ts

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { summaryLine } from "@/lib/analysis-display";
import { fixture } from "./fixtures/analysis-display-fixtures";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function render(...args: string[]): string {
  try {
    const html = execFileSync(process.execPath, [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(DIR, "render-analysis-view.ts"), ...args], { cwd: ROOT, encoding: "utf8" });
    return html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  } catch (err) {
    return `RENDER FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function runAnalysisDisplaySuite(): SuiteResult {
  const out: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, status: ok ? "pass" : "fail", detail });

  // ------------------------------------------------------------ payload gate
  const free = fixture("free-model");
  const premium = fixture("premium-model");
  const freeJson = JSON.stringify(free);
  check("Free payload: no case dates or moves (cases null)", free.cases === null && !freeJson.includes("2023-01-02"), `cases=${JSON.stringify(free.cases)}`);
  check("Free payload: no trader figures (the >=5% band or RSI)", free.trader === null && !/bandLow|RSI|"40"|:40\b/.test(freeJson), `trader=${JSON.stringify(free.trader)}`);
  check("Free payload still says how many cases exist (for the upgrade note)", free.caseCount === 14, String(free.caseCount));
  check("Free payload keeps the history headline, range, confidence and dots (free on every plan)", free.history.line === "Higher 2 weeks later in 9 of 14 similar moments." && free.history.range !== null && free.history.dots.length === 14 && free.history.confidence === "medium", free.history.line);
  check("Premium payload: every case, with dates and moves", premium.cases?.length === 14 && premium.cases[0].date === "2023-01-02" && premium.cases[0].movePct === 3, JSON.stringify(premium.cases?.[0]));
  check("Premium payload: the >=5% band and readings, as trader figures", premium.trader?.bandLow === 9 && premium.trader?.bandHigh === 40 && premium.trader.readings[0].label === "RSI-14", JSON.stringify(premium.trader));

  const legacy = fixture("legacy");
  check("an analysis from before the rebuild still reads: headline from its first sentence, no invented history", legacy.headline === "NVDA saw elevated moves in 5 of 24 analogs." && legacy.history.kind === "none" && legacy.textSource === "legacy", `${legacy.headline} / ${legacy.history.kind}`);
  const line = summaryLine({ id: "x", scope_type: "ticker", scope_value: "NVDA", analysis_type: "d", created_at: "", confidence_level: "medium", sample_size: 24, probability_low: 9, probability_high: 40, reasoning_text: "x", headline: "H.", direction_n: 14, direction_higher: 9, direction_p25: -1.8, direction_median: 1.5, direction_p75: 3, direction_worst: -4, direction_best: 6, direction_confidence: "medium", direction_horizon_sessions: 10 }, "NVDA", null);
  check("list/briefing/Base Camp line: headline + history line, never the band", line.headline === "H." && line.historyLine === "Higher 2 weeks later in 9 of 14 similar moments." && !/40|%/.test(line.historyLine), JSON.stringify(line));

  // ------------------------------------------------------------- database
  const mig = read("supabase/migrations/0053_premium_reads_server_only.sql");
  for (const [table, policy] of [["ai_analyses", "public read"], ["ai_analysis_factors", "public read validated"], ["company_financials_quarterly", "public read"], ["company_financials_annual", "public read"]]) {
    check(`0053 drops the public read on ${table} and revokes select`, mig.includes(`drop policy if exists "${policy}" on public.${table};`) && new RegExp(`revoke select on [^;]*public\\.${table}\\b[^;]*from anon, authenticated`).test(mig), table);
  }
  const srcFiles: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f.name)) srcFiles.push(p);
    }
  };
  walk(path.join(ROOT, "src"));
  const userReads: string[] = [];
  for (const file of srcFiles) {
    const s = fs.readFileSync(file, "utf8");
    for (const m of s.matchAll(/\.from\("(ai_analyses|ai_analysis_factors|ai_analysis_sources|company_financials_quarterly|company_financials_annual)"\)\s*\.(select)/g)) {
      const before = s.slice(Math.max(0, (m.index ?? 0) - 160), m.index);
      if (!/(admin|createAdminClient\(\)|secure)\s*$/.test(before.replace(/\s*\/\/[^\n]*/g, "").trimEnd())) userReads.push(`${path.relative(ROOT, file)}: ${m[1]}`);
    }
  }
  check("every app read of a closed table uses the service role (none through a signed-in client)", userReads.length === 0, userReads.join("; ") || "none");

  // --------------------------------------------------------------- render
  const order = (html: string, labels: string[]) => labels.map((l) => html.indexOf(l)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]));
  const SECTIONS = ["In plain words", "What history says", "Scorecard", "What to watch", "Full breakdown", "Cairn explains what the numbers say"];

  const fr = render("free-model");
  check("render: sections in the agreed order (summary, history, scorecard, watch, breakdown, footer)", order(fr, SECTIONS), fr.slice(0, 160));
  check("render: 'Higher 2 weeks later in 9 of 14 similar moments' and the typical range, before any detail", fr.indexOf("Higher 2 weeks later in 9 of 14") < fr.indexOf("Full breakdown") && fr.includes("Usually between −2% and +3%"), "history first");
  check("render: dots by shape and words, not colour alone", fr.includes("Filled: higher 2 weeks later (9)") && fr.includes("Outlined: lower or unchanged (5)"), "legend");
  check("render: no probability percentage anywhere on the Free page", !/9–40%|probability/i.test(fr), "no band");
  const frCases = render("free-model", "open=cases");
  check("render (Free, cases open): closest case + 'Premium shows all 14 cases', no case list", frCases.includes("Premium shows all 14 cases") && frCases.includes("Closest match") && !frCases.includes("Jan 16, 2023"), "upgrade note");
  const frTrader = render("free-model", "open=trader");
  check("render (Free, trader open): a Premium note and no band", frTrader.includes("Premium shows the trader indicators") && !frTrader.includes("9–40%"), "locked");
  const prTrader = render("premium-model", "open=trader");
  check("render (Premium, trader open): the >=5% band lives here, under Trader indicators", prTrader.includes("9–40%") && prTrader.indexOf("9–40%") > prTrader.indexOf("Trader indicators") && prTrader.includes("RSI-14"), "band in trader row");
  const prCases = render("premium-model", "open=cases");
  check("render (Premium, cases open): every case with its change", (prCases.match(/▲|▼/g) ?? []).length === 14, `${(prCases.match(/▲|▼/g) ?? []).length} cases`);

  check("render: model text is labelled as checked against computed figures", fr.includes("around figures computed in code"), "model meta");
  const tp = render("free-template", "open=how");
  check("render: template text is labelled as Cairn's own words, and 'how' says why", tp.includes("in Cairn's own words") && tp.includes("did not pass every check"), "template meta");

  const coin = render("crypto");
  check("render (coin): '10 days later', company tiles not applicable, no zeros", coin.includes("10 days later") && coin.includes("Not applicable") && !/\b0 times|\$0\b/.test(coin), "coin");
  const etf = render("etf");
  check("render (fund): fund headline, 'no similar moments' said plainly, no invented count", etf.includes("SPY is a fund") && etf.includes("isn't in an unusual price state") && !/in \d+ of \d+ similar/.test(etf), "fund");

  check("render (no holding): no 'What this means for you'", !fr.includes("What this means for you"), "absent");
  const held = render("free-model", "holding");
  check("render (holding): 'What this means for you' after 'What to watch', before the breakdown", order(held, ["What to watch", "What this means for you", "Full breakdown"]), "present");

  return { suiteName: "Analysis display (one look everywhere; Free/Premium on the server)", gating: true, cases: out };
}

async function main() {
  const suite = runAnalysisDisplaySuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
