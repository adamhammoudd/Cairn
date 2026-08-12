// Deterministic unit checks for the probability band that replaced the
// model's self-reported numbers. This math is now load-bearing for the
// product's honest-uncertainty guarantee, so it gets its own gating suite
// that needs no database, no network, and no model.
import "./env";
import { pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";
import { computeProbabilityBand, wilsonInterval } from "@/lib/ai/analytics";

interface Analog {
  id: string;
  event_type: string;
  event_date: string;
  price_before: number | null;
  price_after: number | null;
}

// movePct is the signed move we want this analog to represent.
function analog(id: string, movePct: number): Analog {
  return { id, event_type: "earnings", event_date: "2026-01-01", price_before: 100, price_after: 100 * (1 + movePct / 100) };
}

function check(name: string, condition: boolean, detail: string, attachment?: string): TestCase {
  return { name, status: condition ? "pass" : "fail", detail, attachment: condition ? undefined : attachment };
}

export function runProbabilityMathSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // Wilson interval sanity: known-good reference values.
  const w = wilsonInterval(5, 10);
  cases.push(
    check(
      "wilson: 5/10 brackets the point estimate",
      w.low < 0.5 && w.high > 0.5,
      `interval [${w.low.toFixed(3)}, ${w.high.toFixed(3)}] contains 0.5`,
    ),
  );
  cases.push(
    check(
      "wilson: stays within [0,1] at the extremes",
      wilsonInterval(0, 3).low >= 0 && wilsonInterval(3, 3).high <= 1,
      "no out-of-range bounds for 0/3 or 3/3 — the reason Wilson is used over the normal approximation",
    ),
  );

  const narrow = wilsonInterval(50, 100);
  const wide = wilsonInterval(2, 4);
  cases.push(
    check(
      "wilson: interval widens as sample shrinks",
      wide.high - wide.low > narrow.high - narrow.low,
      `n=4 width ${(wide.high - wide.low).toFixed(3)} > n=100 width ${(narrow.high - narrow.low).toFixed(3)} — ` +
        "this is what makes honest uncertainty automatic",
    ),
  );

  // Empty sample must not fabricate confidence.
  const empty = computeProbabilityBand([]);
  cases.push(
    check(
      "empty analog sample reports low confidence and a maximally wide band",
      empty.confidence === "low" && empty.low === 0 && empty.high === 100 && empty.sampleCount === 0,
      `got ${empty.low}-${empty.high}%, ${empty.confidence} confidence, n=${empty.sampleCount}`,
      JSON.stringify(empty),
    ),
  );

  // Tiny sample must never be high confidence, even when unanimous.
  const unanimousTiny = computeProbabilityBand([analog("a", 12), analog("b", 15), analog("c", -20)]);
  cases.push(
    check(
      "3 unanimous analogs still report low confidence",
      unanimousTiny.confidence === "low",
      `n=3, all cleared the threshold, confidence=${unanimousTiny.confidence} (must be low — small samples never earn high confidence)`,
      JSON.stringify(unanimousTiny),
    ),
  );

  // Threshold logic: only |move| >= 5% counts as elevated.
  const mixed = computeProbabilityBand([analog("a", 1), analog("b", 2), analog("c", 9), analog("d", -8), analog("e", 0.5)]);
  cases.push(
    check(
      "threshold counts only moves >= 5% in absolute terms",
      mixed.hitCount === 2 && mixed.sampleCount === 5,
      `2 of 5 analogs cleared 5% (one +9%, one -8%); got hitCount=${mixed.hitCount}, n=${mixed.sampleCount}`,
      JSON.stringify(mixed),
    ),
  );

  // Analogs missing a usable price pair must be excluded, not counted as misses.
  const withUnusable = computeProbabilityBand([
    analog("a", 9),
    { id: "b", event_type: "earnings", event_date: "2026-01-01", price_before: null, price_after: 120 },
    { id: "c", event_type: "earnings", event_date: "2026-01-01", price_before: 0, price_after: 120 },
  ]);
  cases.push(
    check(
      "analogs without a usable before/after price are excluded from n",
      withUnusable.sampleCount === 1,
      `only 1 of 3 analogs had a usable price pair; got n=${withUnusable.sampleCount}`,
      JSON.stringify(withUnusable),
    ),
  );

  // The band must always contain the observed base rate.
  const large = computeProbabilityBand(
    Array.from({ length: 40 }, (_, i) => analog(`a${i}`, i % 4 === 0 ? 10 : 1)),
  );
  cases.push(
    check(
      "band brackets the observed base rate",
      large.low <= large.pointEstimate && large.pointEstimate <= large.high,
      `${large.low}% <= ${large.pointEstimate}% <= ${large.high}% (n=${large.sampleCount}, confidence=${large.confidence})`,
      JSON.stringify(large),
    ),
  );

  return { suiteName: "Probability math (deterministic)", gating: true, cases };
}

function main() {
  const suite = runProbabilityMathSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  for (const f of failed) console.error(`FAIL: ${f.name} — ${f.detail}`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
