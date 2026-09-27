// AI methodology vs what was agreed - the three code gaps fixed on
// fix/ai-methodology-gaps (2026-09-26 brief, section 4):
//
//   1. A stored analysis's reasoning_text could state a probability the engine
//      never computed ("roughly a 90% probability" beside a stored 21-64%).
//      Chat always had checkNoFreelancedProbability; generate.ts never ran it.
//   2. The Free-tier upgrade note read "Premium shows all 1 analogs": it used
//      analogs.length, and on Free that list is already cut to one.
//   3. Quota checks read `subscriptions` themselves instead of getUserPlan()
//      (CLAUDE.md: every billing gate routes through it), and the analysis
//      quota was count -> generate for seconds -> record, so parallel requests
//      at one remaining slot all passed.
//
// Everything new is imported dynamically so this suite runs - and fails,
// case by case - on main, where those functions do not exist.
//
// Run: npx tsx --conditions=react-server scripts/tests/ai-methodology-gaps.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SuiteResult, TestCase } from "./report";
import { writeReport } from "./report";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Body of `function name(` up to the next top-level `\n}` - enough for these files. */
function fnBody(code: string, name: string): string {
  const start = code.search(new RegExp(`function ${name}\\s*[(<]`));
  if (start < 0) return "";
  const end = code.indexOf("\n}", start);
  return code.slice(start, end < 0 ? undefined : end);
}

export async function runAiMethodologyGapsSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ------------------------------------------------ 1. invented probabilities
  const guard = (await import("../../src/lib/ai/scope-guard")) as Record<string, unknown>;
  const checkClaims = guard.checkAnalysisProbabilityClaims as
    | ((t: string, b: { low: number; high: number; pointEstimate: number | null }) => { passed: boolean })
    | undefined;
  const band = { low: 21, high: 64, pointEstimate: 40 };
  const probabilityCases: [string, string, boolean][] = [
    ["invented figure is rejected", "History suggests roughly a 90% probability of an elevated move.", false],
    ["invented figure below the band is rejected", "There is only a 5% chance of a large move here.", false],
    ["the computed band may be restated", "The analogs put the probability of an elevated move at 21% to 64%.", true],
    ["the base rate may be restated", "In the sample, a 40% likelihood of an elevated move was observed.", true],
    ["plain market moves are not probability claims", "Shares fell 12% after the last two earnings reports.", true],
  ];
  for (const [name, text, shouldPass] of probabilityCases) {
    if (!checkClaims) {
      check(`reasoning_text: ${name}`, false, "checkAnalysisProbabilityClaims does not exist - stored analyses are never checked");
      continue;
    }
    const r = checkClaims(text, band);
    check(`reasoning_text: ${name}`, r.passed === shouldPass, `"${text}" vs stored 21-64% (base 40%) -> ${r.passed ? "passes" : "rejected"}`);
  }

  const gen = stripComments(read("src/lib/ai/generate.ts"));
  const callAt = gen.search(/checkAnalysisProbabilityClaims\(\s*prose\.reasoning_text\s*,\s*band\s*\)/);
  const insertAt = gen.indexOf('.from("ai_analyses")');
  check(
    "generate.ts runs the probability check on reasoning_text before storing",
    callAt > 0 && insertAt > callAt,
    callAt > 0 ? `call at ${callAt}, insert at ${insertAt}` : "no checkAnalysisProbabilityClaims(prose.reasoning_text, band) call",
  );
  check(
    "generate.ts treats a failed probability check as a scope-guard failure",
    /!probabilityCheck\.passed\s*\?\s*probabilityCheck/.test(gen),
    "probabilityCheck must feed `failure`, which logs and refuses to store",
  );

  // --------------------------------------------- 2. the upgrade note's count
  {
    // Rendered in a child process: see render-methodology-card.ts.
    let html = "";
    try {
      html = execFileSync(process.execPath, [require.resolve("tsx/cli"), join(__dirname, "render-methodology-card.ts")], {
        cwd: ROOT,
        encoding: "utf8",
      });
    } catch (err) {
      console.error(err);
    }
    // feat/analysis-display-v2: the card is AnalysisView; its cases row names
    // the true count (14 in the fixture) while Free carries one analog.
    const m = html.match(/All (\d+) historical cases/);
    check(
      "Free cases row counts every case, not the one shown",
      m?.[1] === "14",
      m ? `renders "All ${m[1]} historical cases" with 1 analog in the payload` : "cases row not rendered",
    );
  }

  // ------------------------------------------------- 3. quota gate and race
  const billing = (await import("../../src/lib/billing")) as Record<string, unknown>;
  const reserveWithinLimit = billing.reserveWithinLimit as
    | ((l: { insert(): Promise<string>; count(): Promise<number>; remove(id: string): Promise<void> }, limit: number) => Promise<{ allowed: boolean }>)
    | undefined;

  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));
  function fakeLedger(existing: number) {
    const rows = new Set<string>(Array.from({ length: existing }, (_, i) => `old${i}`));
    let n = 0;
    return {
      rows,
      insert: async () => {
        await tick();
        const id = `new${n++}`;
        rows.add(id);
        return id;
      },
      count: async () => {
        await tick();
        return rows.size;
      },
      remove: async (id: string) => {
        await tick();
        rows.delete(id);
      },
    };
  }

  // The old flow, reproduced: count, a slow generation, then record.
  {
    const ledger = fakeLedger(4);
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const used = await ledger.count();
        if (used >= 5) return false;
        await new Promise((r) => setTimeout(r, 20)); // the generation
        await ledger.insert();
        return true;
      }),
    );
    const granted = outcomes.filter(Boolean).length;
    check(
      "control: count-then-record lets parallel requests past the limit",
      granted > 1,
      `Free limit 5, 4 used, 5 parallel requests -> ${granted} granted, ${ledger.rows.size} recorded`,
    );
  }

  if (!reserveWithinLimit) {
    check("reserve-then-count cannot overrun the limit", false, "reserveWithinLimit does not exist - usage is counted before generation and recorded after");
  } else {
    // Safe, not fair: a burst racing for the final slot can all be refused
    // (each sees the others' reservations). Never more than one is granted,
    // and a refused request takes its row back, so a retry gets the slot.
    let worst = 0;
    let leaked = 0;
    let slotUsed = 0;
    for (let trial = 0; trial < 50; trial++) {
      const ledger = fakeLedger(4);
      const outcomes = await Promise.all(Array.from({ length: 5 }, () => reserveWithinLimit(ledger, 5)));
      const granted = outcomes.filter((o) => o.allowed).length;
      worst = Math.max(worst, granted);
      if (ledger.rows.size !== 4 + granted) leaked++;
      if (granted === 1 || (granted === 0 && (await reserveWithinLimit(ledger, 5)).allowed)) slotUsed++;
    }
    check(
      "reserve-then-count cannot overrun the limit",
      worst <= 1 && leaked === 0,
      `50 trials of 5 parallel requests at 4/5 used: at most ${worst} granted, ${leaked} trials left a refused row behind`,
    );
    check(
      "the last slot is still reachable after a refused burst",
      slotUsed === 50,
      `${slotUsed}/50 trials ended with the slot used (by the burst, or by one retry)`,
    );
    const solo = fakeLedger(0);
    const r = await reserveWithinLimit(solo, 5);
    check("a lone request under the limit is granted and recorded", r.allowed && solo.rows.size === 1, `rows: ${solo.rows.size}`);
  }

  const actions = stripComments(read("src/lib/actions/billing.ts"));
  const chatGate = fnBody(actions, "checkChatUsageAllowed");
  check(
    "checkChatUsageAllowed gets the plan from getUserPlan()",
    chatGate.includes("getUserPlan()") && !chatGate.includes('from("subscriptions")'),
    chatGate.includes('from("subscriptions")') ? "reads subscriptions itself" : "ok",
  );
  const usage = stripComments(read("src/lib/ai-usage.ts"));
  const reserve = fnBody(usage, "reserveAiUsage");
  check(
    "the AI-analysis quota gets the plan from getUserPlan()",
    reserve.includes("getUserPlan()") && !reserve.includes('from("subscriptions")'),
    reserve ? "reserveAiUsage" : "no reserveAiUsage (checkAiUsageAllowed reads subscriptions itself)",
  );
  check(
    "the quota reservation is not a callable server action",
    usage.includes('import "server-only"') && !/export async function (releaseAiUsage|recordAiUsage)/.test(actions),
    "release/record must not be exported from a \"use server\" module",
  );

  const analysis = stripComments(read("src/lib/actions/analysis.ts"));
  const run = fnBody(analysis, "runAnalysisGeneration");
  const reserveAt = run.indexOf("reserveAiUsage(");
  const genAt = run.search(/generateForScope\(|generateWithinReservation\(|generateAnalysis\(/);
  check(
    "requestAnalysis reserves the slot before generating and refunds a failure",
    reserveAt > 0 && genAt > reserveAt && /if \(!outcome\.ok\) \{?\s*await releaseAiUsage/.test(run) && /catch[\s\S]*releaseAiUsage/.test(run),
    reserveAt > 0 ? "reserve -> generate -> release on !ok or throw" : "no reservation",
  );

  return { suiteName: "AI methodology gaps (stored-analysis guard, upgrade note, quota gate)", gating: true, cases };
}

if (process.argv[1]?.endsWith("ai-methodology-gaps.ts")) {
  runAiMethodologyGapsSuite().then((suite) => {
    for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name} - ${c.detail}`);
    const failed = suite.cases.filter((c) => c.status !== "pass");
    console.log(`\n${suite.cases.length - failed.length}/${suite.cases.length} passed`);
    writeReport([suite]);
    if (failed.length > 0) process.exitCode = 1;
  });
}
