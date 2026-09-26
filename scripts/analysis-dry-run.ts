// Generate the new ticker analysis for some symbols WITHOUT writing anything:
// the same inputs (tickerTextInputs) and the same generation and guards
// (generateAnalysisText) as lib/ai/generate.ts, printed as Markdown with the
// computed inputs beside the text. The factor scan is recomputed in memory
// rather than through analyzeFactors, which upserts rows.
//
// Run: npx tsx --conditions=react-server scripts/analysis-dry-run.ts NVDA MSFT KO SPY BTC > out.md
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBars, FACTOR_EVENT_TYPE, type FactorAnalysis } from "@/lib/ai/factor-analysis";
import { benchmarkSymbolFor, computeFactorSet, deriveFactorAnalogs } from "@/lib/ai/factors";
import { computeProbabilityBand, dedupeFactorAnalogs } from "@/lib/ai/analytics";
import { tickerTextInputs } from "@/lib/ai/generate-ticker";
import { buildComputedFigures, generateAnalysisText, historyWords, type GeneratedText, type TextInputs } from "@/lib/ai/analysis-text";

export interface DryRun {
  symbol: string;
  inputs: TextInputs | null;
  generated: GeneratedText | null;
  skipped?: string;
}

export async function dryRunTicker(symbol: string): Promise<DryRun> {
  const db = createAdminClient();
  const { data: dir } = await db.from("symbol_directory").select("asset_type, name").eq("symbol", symbol).maybeSingle();
  const assetType = (dir?.asset_type as string | undefined) ?? null;
  const name = (dir?.name as string | undefined) ?? symbol;
  const bars = await loadBars(db, symbol);
  if (bars.length === 0) return { symbol, inputs: null, generated: null, skipped: "no stored prices (the app would ingest them on first request; this dry run writes nothing)" };

  const bench = benchmarkSymbolFor(symbol, assetType);
  const benchBars = bench ? await loadBars(db, bench) : [];
  const set = computeFactorSet({ symbol, assetType, bars, benchmark: bench && benchBars.length ? { symbol: bench, bars: benchBars } : null });
  const factorAnalysis: FactorAnalysis | null = set ? { set, benchmark: bench, result: deriveFactorAnalogs(set), events: [] } : null;

  const [{ data: news }, { data: curated }] = await Promise.all([
    db.from("news_items").select("id, title, source_name, published_at").contains("tickers", [symbol]).order("published_at", { ascending: false }).limit(25),
    db.from("historical_events").select("id, event_type, event_date, price_before, price_after").eq("symbol", symbol).neq("event_type", FACTOR_EVENT_TYPE).order("event_date", { ascending: false }).limit(50),
  ]);
  const factorRows =
    factorAnalysis?.result.ok
      ? factorAnalysis.result.analogs.instances.map((i) => ({ id: i.date, event_type: FACTOR_EVENT_TYPE, event_date: i.date, price_before: i.priceBefore, price_after: i.priceAfter }))
      : [];
  const band = computeProbabilityBand([...(curated ?? []), ...dedupeFactorAnalogs(curated ?? [], factorRows)]);

  const { inputs } = await tickerTextInputs({ supabase: db, symbol, name, assetType, factorAnalysis, band, news: news ?? [] });
  const generated = await generateAnalysisText(inputs);
  return { symbol, inputs, generated };
}

export function renderDryRun(r: DryRun): string {
  if (!r.inputs || !r.generated) return `## ${r.symbol}\n\nSkipped: ${r.skipped}\n`;
  const i = r.inputs;
  const g = r.generated;
  const hw = historyWords(i.history, i.name, i.assetType, i.noHistoryReason, i.historyBasis)!;
  const watch = g.text.watch.map((w) => `- ${w.text} _(${w.ref.split(":")[0]})_`).join("\n") || "- (nothing dated in the calendar and no headline without a number)";
  return `## ${r.symbol} - ${i.name} (${i.assetType ?? "unknown"})

**Text source:** ${g.source}${g.attempts.length ? ` (rejected drafts: ${g.attempts.map((a) => a.reason).join(", ")})` : ""}

**Headline:** ${g.text.headline}

${g.text.bullets.map((b) => `- ${b}`).join("\n")}

**History line:** ${hw.line}${hw.range ? ` ${hw.range}` : ""} ${hw.confidence}

**What to watch:**
${watch}

<details><summary>Computed inputs the text was checked against</summary>

\`\`\`
${buildComputedFigures(i)}
\`\`\`
</details>
`;
}

async function main() {
  const symbols = process.argv.slice(2);
  for (const s of symbols) {
    try {
      console.log(renderDryRun(await dryRunTicker(s)));
    } catch (err) {
      console.log(`## ${s}\n\nFailed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

if (process.argv[1]?.endsWith("analysis-dry-run.ts")) void main();
