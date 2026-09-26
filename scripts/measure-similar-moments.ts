// Measure each "similar moment" condition on its own, per the rule fixed in
// docs/decisions/2026-09-27-analysis-rebuild.md: a condition is kept only if it
// leaves >=5 cases for most of the symbols it applies to (NVDA, MSFT, BTC).
//
// Read-only. The factor scan is recomputed in memory (computeFactorSet +
// deriveFactorAnalogs) rather than through analyzeFactors, which upserts rows.
//
// Run: npx tsx --conditions=react-server scripts/measure-similar-moments.ts [SYMBOL ...]
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBars } from "@/lib/ai/factor-analysis";
import { benchmarkSymbolFor, computeFactorSet, deriveFactorAnalogs, type FactorInstance } from "@/lib/ai/factors";
import { loadScorecard } from "@/lib/scorecard-data";
import { conditionSpecs, ENGINE_CONDITIONS, loadConditionData } from "@/lib/ai/similar-moments-data";
import { applyConditions, type ExtraConditionKey } from "@/lib/ai/similar-moments";
import { directionalHistory } from "@/lib/ai/direction";

const KEYS: ExtraConditionKey[] = ["earnings_window", "trend_level", "valuation_level"];
const ENGINE = ENGINE_CONDITIONS;

function summarise(cases: FactorInstance[]) {
  const h = directionalHistory(cases.map((c) => ({ date: c.date, priceBefore: c.priceBefore, priceAfter: c.priceAfter })), 10);
  return `n=${h.n} higher=${h.higher} (${h.upRate.point ?? "-"}%) median=${h.typical?.median ?? "-"}% p25..p75=${h.typical ? `${h.typical.p25}..${h.typical.p75}` : "-"} conf=${h.confidence}`;
}

async function main() {
  const symbols = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["NVDA", "MSFT", "BTC", "SPY"];
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  for (const symbol of symbols) {
    const { data: dir } = await db.from("symbol_directory").select("asset_type").eq("symbol", symbol).maybeSingle();
    const assetType = (dir?.asset_type as string | undefined) ?? null;
    const bars = await loadBars(db, symbol);
    const bench = benchmarkSymbolFor(symbol, assetType);
    const benchBars = bench ? await loadBars(db, bench) : [];
    const set = computeFactorSet({ symbol, assetType, bars, benchmark: bench && benchBars.length ? { symbol: bench, bars: benchBars } : null });
    if (!set) {
      console.log(`\n${symbol}: too little price history (${bars.length} bars)`);
      continue;
    }
    const result = deriveFactorAnalogs(set);
    if (!result.ok) {
      console.log(`\n${symbol}: no usable factor set (${result.reason}, best ${result.bestSampleSize})`);
      continue;
    }
    const bundle = await loadScorecard(symbol, { supabase: db, today });
    const data = await loadConditionData(db, symbol, today, bundle.pricesAsc);
    const base = result.analogs.instances;
    console.log(`\n${symbol} (${assetType}) as of ${set.asOf}; matched on: ${result.analogs.conditions.map((c) => `${c.key}:${c.state}`).join(", ")}`);
    console.log(`  base                       ${summarise(base)}`);
    for (const key of KEYS) {
      const [spec] = conditionSpecs({ set, assetType, scorecard: bundle.scorecard, data, today, keys: [key] });
      // min 0: report what the condition WOULD leave, even under 5.
      const { cases, report } = applyConditions(base, [spec], 0);
      const r = report[0];
      const states = base.map((c) => spec.stateOf(c));
      const dist = [...new Set(states)].map((s) => `${s}:${states.filter((x) => x === s).length}`).join(" ");
      console.log(`  +${key.padEnd(16)} today=${String(r.today).padEnd(10)} ${r.reason === "applied" ? summarise(cases) : r.reason}   [base states ${dist}]`);
    }
    const all = applyConditions(base, conditionSpecs({ set, assetType, scorecard: bundle.scorecard, data, today, keys: ENGINE }));
    console.log(`  engine (ENGINE_CONDITIONS) ${summarise(all.cases)}   ${all.report.map((r) => `${r.key}:${r.reason}(${r.nAfter})`).join(" ")}`);
  }
}
main();
