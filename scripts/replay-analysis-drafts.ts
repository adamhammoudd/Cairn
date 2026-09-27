// Replay rejected analysis drafts against the checks, with the offending phrase
// (fix/analysis-unique-titles).
//
// Every rejected model draft is kept in ai_scope_guard_log (source_surface =
// 'analysis') - the text, not the evidence. This rebuilds each draft's inputs
// as they were at generation time (news published up to that moment, "today"
// = that date) and re-runs checkAnalysisText, printing the reason and the
// exact phrase. Read-only.
//
// Run: npx tsx --conditions=react-server scripts/replay-analysis-drafts.ts [--limit=20] [--symbol=NVDA]
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBars, type FactorAnalysis } from "@/lib/ai/factor-analysis";
import { benchmarkSymbolFor, computeFactorSet, deriveFactorAnalogs } from "@/lib/ai/factors";
import { computeProbabilityBand } from "@/lib/ai/analytics";
import { tickerTextInputs } from "@/lib/ai/generate-ticker";
import { checkAnalysisText, type ModelAnalysisText, type TextInputs } from "@/lib/ai/analysis-text";

/** The analysis stored within a minute of the draft tells us which symbol it was for. */
async function symbolFor(db: ReturnType<typeof createAdminClient>, at: string): Promise<string | null> {
  const from = new Date(Date.parse(at) - 60_000).toISOString();
  const to = new Date(Date.parse(at) + 60_000).toISOString();
  const { data } = await db.from("ai_analyses").select("scope_value").eq("scope_type", "ticker").gte("created_at", from).lte("created_at", to).limit(1);
  return (data?.[0]?.scope_value as string | undefined) ?? null;
}

export async function inputsAsOf(symbol: string, at: string): Promise<TextInputs> {
  const db = createAdminClient();
  const today = at.slice(0, 10);
  const { data: dir } = await db.from("symbol_directory").select("asset_type, name").eq("symbol", symbol).maybeSingle();
  const assetType = (dir?.asset_type as string | undefined) ?? null;
  const name = (dir?.name as string | undefined) ?? symbol;
  const bars = (await loadBars(db, symbol)).filter((b) => b.date <= today);
  const bench = benchmarkSymbolFor(symbol, assetType);
  const benchBars = bench ? (await loadBars(db, bench)).filter((b) => b.date <= today) : [];
  const set = computeFactorSet({ symbol, assetType, bars, benchmark: bench && benchBars.length ? { symbol: bench, bars: benchBars } : null });
  const factorAnalysis: FactorAnalysis | null = set ? { set, benchmark: bench, result: deriveFactorAnalogs(set), events: [] } : null;
  // Same query as lib/ai/generate.ts, cut at the moment the draft was written.
  const { data: news } = await db
    .from("news_items")
    .select("id, title, body, source_name, published_at, tickers, sectors")
    .contains("tickers", [symbol])
    .lte("published_at", at)
    .order("published_at", { ascending: false })
    .limit(25);
  const band = computeProbabilityBand([]);
  const { inputs } = await tickerTextInputs({ supabase: db, symbol, name, assetType, factorAnalysis, band, news: news ?? [], today });
  return inputs;
}

async function main() {
  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 20);
  const only = process.argv.find((a) => a.startsWith("--symbol="))?.slice(9).toUpperCase();
  const db = createAdminClient();
  const { data: rows, error } = await db
    .from("ai_scope_guard_log")
    .select("created_at, flag_reason, raw_output")
    .eq("source_surface", "analysis")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  console.log("# Rejected analysis drafts, replayed\n");
  for (const r of rows ?? []) {
    const symbol = await symbolFor(db, r.created_at as string);
    if (!symbol || (only && symbol !== only)) continue;
    let draft: ModelAnalysisText;
    try {
      draft = JSON.parse(r.raw_output as string) as ModelAnalysisText;
    } catch {
      continue;
    }
    const inputs = await inputsAsOf(symbol, r.created_at as string);
    const check = checkAnalysisText(draft, inputs);
    console.log(`## ${symbol} - ${r.created_at} - logged as ${r.flag_reason}`);
    console.log(`- Headline: ${draft.headline}`);
    console.log(`- Now: ${check.passed ? "PASSES" : `${check.reason} - ${check.evidence ?? ""}`}`);
    console.log(`- Headlines the model saw: ${inputs.news.map((n) => `${n.id}=${n.source}`).join(", ") || "none"}`);
    console.log(`- Events: ${inputs.events.map((e) => `${e.id}=${e.kind} ${e.date}`).join(", ") || "none"}\n`);
  }
}

if (process.argv[1]?.endsWith("replay-analysis-drafts.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
