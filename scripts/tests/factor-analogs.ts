// Deterministic checks for the factor-derived analog engine (lib/ai/factors.ts)
// and the pieces that wrap it. Like probability-math, this needs no database,
// no network and no model: everything is computed from seeded synthetic prices,
// so a failure here is a real change in the arithmetic, never in the weather.
import "./env";
import { pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";
import {
  computeFactorSet,
  deriveFactorAnalogs,
  rsiSeries,
  quantile,
  percentileRank,
  benchmarkSymbolFor,
  FACTOR_FORWARD_SESSIONS,
  MIN_FACTOR_ANALOG_SAMPLE,
  MIN_FACTOR_HISTORY_BARS,
  type FactorBar,
} from "@/lib/ai/factors";
import { computeProbabilityBand, dedupeFactorAnalogs, computeSimilarityScore, ANALOG_OVERLAP_DAYS } from "@/lib/ai/analytics";
import { eventTypeLabel, EVENT_TYPE_LABELS } from "@/lib/analysis";
import { FACTOR_EVENT_TYPE } from "@/lib/ai/factor-analysis";
import { checkCompleteness } from "@/lib/ai/scope-guard";
import { deriveVolatilityRegimes, EQUITY_PERIODS_PER_YEAR } from "../../supabase/functions/_shared/volatility";

function check(name: string, condition: boolean, detail: string, attachment?: string): TestCase {
  return { name, status: condition ? "pass" : "fail", detail, attachment: condition ? undefined : attachment };
}

// Seeded PRNG so the series (and therefore every assertion) never changes.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

function dateAt(i: number): string {
  return new Date(Date.UTC(2023, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
}

interface SeriesOptions {
  n: number;
  seed: number;
  drift?: number;
  vol?: number;
  burst?: { from: number; to: number; vol: number };
}

function makeBars({ n, seed, drift = 0.0003, vol = 0.012, burst }: SeriesOptions): FactorBar[] {
  const rand = mulberry32(seed);
  let price = 100;
  return Array.from({ length: n }, (_, i) => {
    const v = burst && i >= burst.from && i < burst.to ? burst.vol : vol;
    price *= Math.exp(drift + v * gaussian(rand));
    return { date: dateAt(i), close: price, volume: Math.round(1_000_000 * (0.8 + 0.4 * rand())) };
  });
}

export function runFactorAnalogsSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // --- RSI: hand-computed Wilder reference (period 2). ---
  const rsi = rsiSeries([10, 11, 10, 11, 12, 13], 2);
  cases.push(
    check(
      "rsi: matches a hand-computed Wilder series",
      rsi[0] === null && rsi[1] === null && rsi[2] === 50 && rsi[3] === 75 && Math.abs((rsi[4] as number) - 87.5) < 1e-9,
      `rsi = ${JSON.stringify(rsi)} (expected [null, null, 50, 75, 87.5, ...])`,
    ),
  );
  cases.push(
    check(
      "rsi: a strictly rising series reads 100, a falling one reads 0",
      rsiSeries([1, 2, 3, 4, 5, 6], 2).at(-1) === 100 && rsiSeries([6, 5, 4, 3, 2, 1], 2).at(-1) === 0,
      "no losses -> 100, no gains -> 0",
    ),
  );

  cases.push(
    check(
      "quantile / percentileRank: linear interpolation and rank",
      quantile([1, 2, 3, 4, 5], 0.5) === 3 && quantile([1, 2, 3, 4, 5], 0.25) === 2 && percentileRank([1, 2, 3, 4, 5], 4) === 80,
      "median of 1..5 is 3, first quartile 2, and 4 sits at the 80th percentile",
    ),
  );

  // --- History floor. ---
  cases.push(
    check(
      "history floor: fewer than MIN_FACTOR_HISTORY_BARS bars yields no factor set",
      computeFactorSet({ symbol: "NEW", assetType: "equity", bars: makeBars({ n: MIN_FACTOR_HISTORY_BARS - 1, seed: 1 }) }) === null &&
        computeFactorSet({ symbol: "NEW", assetType: "equity", bars: makeBars({ n: MIN_FACTOR_HISTORY_BARS, seed: 1 }) }) !== null,
      `floor is ${MIN_FACTOR_HISTORY_BARS} bars`,
    ),
  );

  // --- Determinism and readings on a realistic series. ---
  const bars = makeBars({ n: 500, seed: 42, burst: { from: 350, to: 372, vol: 0.05 } });
  const spy = makeBars({ n: 500, seed: 7 });
  const input = { symbol: "TEST", assetType: "equity", bars, benchmark: { symbol: "SPY", bars: spy } };
  const setA = computeFactorSet(input)!;
  const setB = computeFactorSet(input)!;
  cases.push(
    check(
      "determinism: the same prices give byte-identical readings and analogs",
      JSON.stringify(setA.readings) === JSON.stringify(setB.readings) &&
        JSON.stringify(deriveFactorAnalogs(setA)) === JSON.stringify(deriveFactorAnalogs(setB)),
      "no clock, randomness or ordering dependence in the factor pipeline",
    ),
  );
  cases.push(
    check(
      "readings: all eight factors are present with sane ranges",
      setA.readings.length === 8 &&
        setA.readings.every((r) => r.percentile === null || (r.percentile >= 0 && r.percentile <= 100)) &&
        (setA.readings.find((r) => r.key === "rsi14")!.value as number) >= 0 &&
        (setA.readings.find((r) => r.key === "rsi14")!.value as number) <= 100 &&
        (setA.readings.find((r) => r.key === "drawdown")!.value as number) <= 0,
      setA.readings.map((r) => `${r.key}=${r.value}`).join(", "),
      JSON.stringify(setA.readings),
    ),
  );
  cases.push(
    check(
      "relative strength: unavailable (not fabricated) when no benchmark is supplied",
      computeFactorSet({ ...input, benchmark: null })!.readings.find((r) => r.key === "relative_strength")!.value === null,
      "no benchmark -> null reading, never a made-up comparison",
    ),
  );
  cases.push(
    check(
      "benchmark choice: SPY for equities, BTC for crypto, none for the benchmark itself",
      benchmarkSymbolFor("AAPL", "equity") === "SPY" &&
        benchmarkSymbolFor("ETH", "crypto") === "BTC" &&
        benchmarkSymbolFor("SPY", "etf") === null &&
        benchmarkSymbolFor("BTC", "crypto") === null,
      "no sector ETF is invented - the SECTORS map covers six symbols and names none",
    ),
  );

  // --- The volatility state agrees with the shared deriveVolatilityRegimes. ---
  const dates = bars.map((b) => b.date);
  const regimes = deriveVolatilityRegimes(dates, bars.map((b) => b.close), EQUITY_PERIODS_PER_YEAR);
  const firstElevatedIdx = setA.series.volatility.states.findIndex((s) => s === "elevated");
  cases.push(
    check(
      "volatility: first elevated day equals the shared regime detector's first regime start",
      regimes.length > 0 && firstElevatedIdx >= 0 && regimes[0].event_date === dates[firstElevatedIdx],
      `regime starts ${regimes[0]?.event_date ?? "none"}, factor state first elevated ${dates[firstElevatedIdx] ?? "never"}`,
    ),
  );

  // --- Analog scan invariants. Scan several seeds so a one-off series can't hide a bug. ---
  const H = FACTOR_FORWARD_SESSIONS;
  let scannedSets = 0;
  let okSets = 0;
  let invariantFailure: string | null = null;
  const spy700 = makeBars({ n: 700, seed: 99 });
  for (let seed = 1; seed <= 40 && !invariantFailure; seed++) {
    const b = makeBars({ n: 700, seed, drift: seed % 2 === 0 ? 0.0008 : -0.0002, burst: { from: 420, to: 445, vol: 0.045 } });
    const set = computeFactorSet({ symbol: "T", assetType: "equity", bars: b, benchmark: { symbol: "SPY", bars: spy700 } })!;
    scannedSets++;
    const res = deriveFactorAnalogs(set);
    if (!res.ok) continue;
    okSets++;
    const { instances, conditions } = res.analogs;
    if (instances.length < MIN_FACTOR_ANALOG_SAMPLE) invariantFailure = `seed ${seed}: ok result with n=${instances.length} below floor`;
    for (let k = 0; k < instances.length && !invariantFailure; k++) {
      const i = instances[k];
      if (k > 0 && i.index - instances[k - 1].index < H) invariantFailure = `seed ${seed}: overlapping instances ${instances[k - 1].index}, ${i.index}`;
      else if (i.index + H > b.length - 1) invariantFailure = `seed ${seed}: instance ${i.index} has an incomplete forward window`;
      else if (i.priceBefore !== b[i.index].close || i.priceAfter !== b[i.index + H].close) invariantFailure = `seed ${seed}: instance ${i.index} price mismatch`;
      else if (!conditions.every((c) => set.series[c.key].states[i.index] === c.state)) invariantFailure = `seed ${seed}: instance ${i.index} does not satisfy its own conditions`;
      else if (Math.abs(i.movePct - ((i.priceAfter - i.priceBefore) / i.priceBefore) * 100) > 1e-9) invariantFailure = `seed ${seed}: instance ${i.index} move mismatch`;
    }
  }
  cases.push(
    check(
      "analog scan: instances never overlap, never peek past the data, and satisfy their own conditions",
      invariantFailure === null && okSets > 0,
      invariantFailure ?? `${okSets}/${scannedSets} seeded series produced a usable analog set; every one held all invariants`,
    ),
  );

  // --- The floor: a series with no active state cannot produce analogs. ---
  const flat: FactorBar[] = Array.from({ length: 400 }, (_, i) => ({ date: dateAt(i), close: 100, volume: 1000 }));
  const flatResult = deriveFactorAnalogs(computeFactorSet({ symbol: "FLAT", assetType: "equity", bars: flat })!);
  cases.push(
    check(
      "floor: a series with nothing to match returns a refusal, not a number",
      !flatResult.ok,
      flatResult.ok ? "unexpected ok" : `refused with reason "${flatResult.reason}"`,
    ),
  );

  // --- The maths downstream is unchanged: Wilson widens with a smaller sample. ---
  const mk = (n: number, hits: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: String(i),
      event_type: "factor_signal",
      event_date: "2026-01-01",
      price_before: 100,
      price_after: i < hits ? 108 : 101,
    }));
  const small = computeProbabilityBand(mk(MIN_FACTOR_ANALOG_SAMPLE, 2));
  const large = computeProbabilityBand(mk(50, 20));
  cases.push(
    check(
      "band: the same 40% hit rate is wider and lower-confidence at n=5 than at n=50",
      small.high - small.low > large.high - large.low && small.confidence === "low" && large.confidence !== "low",
      `n=5 -> ${small.low}-${small.high}% (${small.confidence}); n=50 -> ${large.low}-${large.high}% (${large.confidence})`,
    ),
  );

  // --- Layering on curated analogs without double counting one move. ---
  const curated = [{ event_date: "2026-03-10" }];
  const factor = [
    { event_date: "2026-03-10" },
    { event_date: "2026-03-01" }, // 9 days away - inside the window
    { event_date: "2026-03-24" }, // exactly ANALOG_OVERLAP_DAYS away - outside
    { event_date: "2026-05-01" },
  ];
  const kept = dedupeFactorAnalogs(curated, factor).map((f) => f.event_date);
  cases.push(
    check(
      "dedupe: factor analogs inside the overlap window of a curated event are dropped, the rest kept",
      JSON.stringify(kept) === JSON.stringify(["2026-03-24", "2026-05-01"]) && ANALOG_OVERLAP_DAYS === 14,
      `kept ${JSON.stringify(kept)} of 4`,
    ),
  );
  cases.push(
    check(
      "dedupe: with no curated events every factor analog is kept",
      dedupeFactorAnalogs([], factor).length === factor.length,
      "a cold ticker keeps its whole factor-derived set",
    ),
  );

  // --- Similarity: the existing decay, scaled by match fraction. ---
  const asOf = new Date("2026-06-01");
  const full = computeSimilarityScore("2026-06-01", asOf);
  const half = computeSimilarityScore("2026-06-01", asOf, 0.5);
  cases.push(
    check(
      "similarity: default behaviour unchanged; a partial match scales it down",
      full === 1 && half === 0.5 && computeSimilarityScore("2025-06-01", asOf) === 0.5,
      `same-day full=${full}, half-match=${half}, one year old=${computeSimilarityScore("2025-06-01", asOf)}`,
    ),
  );

  // --- Completeness gate: only adds a requirement, weakens nothing. ---
  const base = { source_count: 2, historical_analog_count: 6, sample_size: 6 };
  const prose = "Historically a move of this size has followed about half of these occasions, but the sample is small.";
  const factorProse = "The RSI-14 was overbought and price sat well above its moving averages, and in those past occasions a large move followed about half the time.";
  cases.push(
    check(
      "completeness: unchanged when factor evidence is not required",
      checkCompleteness({ ...base, reasoning_text: prose }).passed,
      "sector/market analyses are judged exactly as before",
    ),
  );
  const ignored = checkCompleteness({ ...base, reasoning_text: prose, factor_evidence_required: true });
  cases.push(
    check(
      "completeness: prose that ignores the factor evidence is rejected when it is required",
      !ignored.passed && ignored.reason === "ignores_factor_evidence",
      `reason = ${ignored.reason}`,
    ),
  );
  cases.push(
    check(
      "completeness: prose engaging with the factors passes when required",
      checkCompleteness({ ...base, reasoning_text: factorProse, factor_evidence_required: true }).passed,
      "names RSI / moving averages",
    ),
  );
  cases.push(
    check(
      "completeness: the existing rejections still fire first",
      checkCompleteness({ ...base, source_count: 0, reasoning_text: factorProse, factor_evidence_required: true }).reason === "no_sources_cited" &&
        checkCompleteness({ ...base, reasoning_text: "short", factor_evidence_required: true }).reason === "missing_or_too_short_reasoning",
      "no_sources_cited and missing_or_too_short_reasoning are unaffected",
    ),
  );

  cases.push(
    check(
      "floor constants: the named sample-size floor is 5, matching the low-confidence line",
      MIN_FACTOR_ANALOG_SAMPLE === 5,
      `MIN_FACTOR_ANALOG_SAMPLE = ${MIN_FACTOR_ANALOG_SAMPLE}`,
    ),
  );

  // --- How the new analog type SURFACES -------------------------------------
  // Every screen that shows an analog printed the raw event_type column. That
  // was survivable while the vocabulary was all single words; `factor_signal`
  // rendered as "factor_signal" / "Factor_signal" / "FACTOR_SIGNAL" depending
  // on the surface, and it is now the majority of the analogs shown for most
  // tickers. These lock the label in so a new event type cannot reach the UI
  // as raw snake_case again.
  cases.push(
    check(
      "label: factor_signal reads as prose, not as the column value",
      eventTypeLabel(FACTOR_EVENT_TYPE) === "Price-history signal",
      `${FACTOR_EVENT_TYPE} -> "${eventTypeLabel(FACTOR_EVENT_TYPE)}"`,
    ),
  );
  // The vocabulary the database itself allows (migration 0046's check
  // constraint). If a type is added there without a label, this fails.
  const DB_EVENT_TYPES = ["earnings", "split", "dividend", "macro", "ipo", "guidance", "volatility_regime", "factor_signal"];
  const unlabelled = DB_EVENT_TYPES.filter((t) => !(t in EVENT_TYPE_LABELS));
  cases.push(
    check(
      "label: every event type the schema permits has one",
      unlabelled.length === 0,
      unlabelled.length === 0 ? `all ${DB_EVENT_TYPES.length} covered` : `missing: ${unlabelled.join(", ")}`,
    ),
  );
  const rawLooking = DB_EVENT_TYPES.filter((t) => eventTypeLabel(t).includes("_"));
  cases.push(
    check(
      "label: no label leaks an underscore to the UI",
      rawLooking.length === 0,
      rawLooking.length === 0 ? "none" : `raw: ${rawLooking.join(", ")}`,
    ),
  );
  cases.push(
    check(
      "label: an unknown type degrades to spaced words, never blank",
      eventTypeLabel("some_future_type") === "some future type" && eventTypeLabel("x") === "x",
      "an event type added to the database before it is added here still reads",
    ),
  );

  return { suiteName: "Factor-derived analogs (deterministic)", gating: true, cases };
}

function main() {
  const suite = runFactorAnalogsSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
