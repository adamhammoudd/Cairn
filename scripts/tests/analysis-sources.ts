// Sources without tagged news (fix/analysis-sources).
//
// The guardrail is "every analysis shows its sources", not "every analysis
// cites a news article". A share with no tagged news (Micron, 2026-09-27) is
// analysed citing the data its figures come from - SEC filings by accession
// number, the price history with its dates, calendar entries - and says
// plainly that no recent news was found. What is NOT relaxed:
//   * every source the text cites must exist (sources_used -> a real news id);
//   * every number in the text must come from the computed inputs (a data
//     source's label is not an input: "10662 prices" cannot be quoted).
// The targeted per-ticker news fetch is not shipped: its feed's terms are
// escalated (docs/legal/2026-09-27-per-ticker-news-feed-terms.md).
//
// Pure: no network, no database (source checks read files).
//
// Run: npx tsx --conditions=react-server scripts/tests/analysis-sources.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildDataSources, edgarUrl, noNewsLine } from "@/lib/ai/data-sources";
import { findDataGaps } from "@/lib/analysis-gaps";
import { MIN_FACTOR_ANALOG_SAMPLE } from "@/lib/ai/factors";
import { buildComputedFigures, checkAnalysisText, templateAnalysisText, type TextInputs } from "@/lib/ai/analysis-text";
import { directionalHistory } from "@/lib/ai/direction";
import { textInputsFor } from "@/lib/ai/ticker-analysis";
import { buildAnalysisDisplay } from "@/lib/analysis-display";
import { computeProbabilityBand } from "@/lib/ai/analytics";
import type { Scorecard } from "@/lib/scorecard";
import { renderComponentText } from "./render-helper";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const prices = { count: 10662, first: "1984-06-01", last: "2026-09-25" };
const filing = { cik: "0000723125", accn: "0000723125-26-000015", form: "10-Q", filed: "2026-06-25" };
const release = { cik: "0000723125", accn: "0000723125-26-000013", releaseDate: "2026-06-24" };

export async function runAnalysisSourcesSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];

  // --- 1. What each asset type cites.
  const mu = buildDataSources({ symbol: "MU", assetType: "equity", name: "Micron Technology, Inc.", prices, filing, release, calendar: [{ id: "cal-1", event_type: "earnings", event_date: "2026-12-17" }], coin: null });
  cases.push(check("a share cites prices, its periodic filing, its results release and its calendar date", mu.map((d) => d.kind).join(",") === "price_data,sec_filing,sec_filing,calendar", mu.map((d) => d.kind).join(",")));
  cases.push(check("price data names the provider and the as-of date", mu[0].label === "10662 daily closing prices for MU, 1984-06-01 to 2026-09-25 (Yahoo Finance chart data)" && mu[0].asOf === "2026-09-25", mu[0].label));
  cases.push(check("SEC filings are cited by accession number with their EDGAR folder", mu[1].reference === filing.accn && mu[1].url === "https://www.sec.gov/Archives/edgar/data/723125/000072312526000015/" && /10-Q/.test(mu[1].label), JSON.stringify(mu[1])));
  cases.push(check("the results release is its 8-K item 2.02", mu[2].reference === release.accn && /8-K item 2\.02/.test(mu[2].label), mu[2].label));
  cases.push(check("edgarUrl strips leading zeros from the CIK and dashes from the accession", edgarUrl("0000002488", "0000002488-26-000121") === "https://www.sec.gov/Archives/edgar/data/2488/000000248826000121/", edgarUrl("0000002488", "0000002488-26-000121")));
  const schd = buildDataSources({ symbol: "SCHD", assetType: "etf", name: "Schwab U.S. Dividend Equity ETF", prices, filing: null, release: null, calendar: [], coin: null });
  cases.push(check("a fund cites its prices and its name/issuer, no filings", schd.map((d) => d.kind).join(",") === "price_data,fund_profile" && /Schwab/.test(schd[1].label), JSON.stringify(schd)));
  const inj = buildDataSources({ symbol: "INJ", assetType: "crypto", name: "Injective USD", prices, filing: null, release: null, calendar: [], coin: { updatedAt: "2026-09-27T14:00:00Z", name: "Injective" } });
  cases.push(check("a coin cites its prices and its market data, no filings", inj.map((d) => d.kind).join(",") === "price_data,coin_profile" && inj[1].asOf === "2026-09-27" && /daily prices/.test(inj[0].label), JSON.stringify(inj)));
  const none = buildDataSources({ symbol: "X", assetType: "equity", name: null, prices: null, filing: null, release: null, calendar: [], coin: null });
  cases.push(check("nothing read -> nothing cited (no invented source)", none.length === 0, JSON.stringify(none)));

  // --- 2. No news is not a dead end for a ticker - and is said plainly.
  const g = findDataGaps({ scopeType: "ticker", analogCount: 33, sourceCount: 0 + mu.length, factor: { ok: true }, minSample: MIN_FACTOR_ANALOG_SAMPLE });
  cases.push(check("MU shape (analogs, 0 news, data sources) -> no gap", g.length === 0, JSON.stringify(g)));
  const sector = findDataGaps({ scopeType: "sector", analogCount: 10, sourceCount: 0, factor: null, minSample: MIN_FACTOR_ANALOG_SAMPLE });
  cases.push(check("a sector with no news still stops on no_news (no data of its own)", sector.map((x) => x.reason).join(",") === "no_news", JSON.stringify(sector)));
  cases.push(check("no-news line with filings", noNewsLine("Micron Technology", mu) === "No recent news mentioning Micron Technology was found. This analysis cites its SEC filings and price data instead.", noNewsLine("Micron Technology", mu)));
  cases.push(check("no-news line without filings (coin)", noNewsLine("Injective", inj) === "No recent news mentioning Injective was found. This analysis cites its price data instead.", noNewsLine("Injective", inj)));

  const card = { symbol: "MU", asOf: "2026-09-25", dimensions: [] } as unknown as Scorecard;
  const history = directionalHistory(
    Array.from({ length: 20 }, (_, i) => ({ date: `2024-0${1 + (i % 9)}-1${i % 10}`, priceBefore: 100, priceAfter: 100 + ((i * 7) % 11) - 4 })),
    10,
  );
  const sm = { kind: "similar" as const, history, factorConditions: [], baseCount: 20, cases: [], conditions: [] };
  const band = computeProbabilityBand([]);
  const inputs: TextInputs = textInputsFor({ name: "Micron Technology, Inc.", symbol: "MU", assetType: "equity", factorAnalysis: null, sm, scorecard: card, calendar: [], news: [], band, dataSources: mu });
  cases.push(check("text inputs carry the no-news line and the data labels", inputs.noNews === noNewsLine("Micron Technology", mu) && inputs.dataSources?.length === mu.length, JSON.stringify({ noNews: inputs.noNews, n: inputs.dataSources?.length })));
  const figures = buildComputedFigures(inputs);
  cases.push(check("the model is told there is no news and not to imply any", /- none found\. No recent news mentioning Micron Technology was found\..*Do not mention or imply any news\./.test(figures), figures.slice(figures.indexOf("RECENT HEADLINES"), figures.indexOf("RECENT HEADLINES") + 260)));
  cases.push(check("the model sees the data sources as context", /DATA THE FIGURES WERE COMPUTED FROM/.test(figures) && figures.includes(mu[1].label), "data block"));
  const t = templateAnalysisText(inputs);
  const tc = checkAnalysisText(t, inputs, { minWatch: 0 });
  cases.push(check("Cairn's template says there is no news, in the summary itself, and passes every guard", t.bullets.includes(inputs.noNews!) && tc.passed, `${tc.reason ?? "passed"} | ${t.bullets.join(" / ")}`));

  // --- 3. Not relaxed.
  const withSource = { ...t, sources_used: ["N1"] };
  const r1 = checkAnalysisText(withSource, inputs, { minWatch: 0 });
  cases.push(check("citing a news id that does not exist still fails (unknown_source)", !r1.passed && r1.reason === "unknown_source", `${r1.reason}`));
  const quoting = { ...t, bullets: [...t.bullets.slice(0, 2), "Cairn holds 10662 daily closing prices for it."] };
  const r2 = checkAnalysisText(quoting, inputs, { minWatch: 0 });
  cases.push(check("a number from a data-source label is not an input (number_not_in_inputs)", !r2.passed && r2.reason === "number_not_in_inputs", `${r2.reason} ${r2.evidence ?? ""}`));
  const watchData = { ...t, watch: [{ text: "Quarterly report, see SEC EDGAR.", ref: "D1" }] };
  const r3 = checkAnalysisText(watchData, inputs, { minWatch: 0 });
  cases.push(check("a watch item cannot cite a data source by an invented id (watch_unsourced)", !r3.passed && r3.reason === "watch_unsourced", `${r3.reason}`));

  // --- 4. What the page shows.
  const row = { id: "a1", scope_type: "ticker", scope_value: "MU", analysis_type: "directional_history", created_at: "2026-09-27", confidence_level: "medium", sample_size: 20, reasoning_text: "", headline: "Micron is a strong company.", bullets: t.bullets, watch: [], sources_used: [], text_source: "template" };
  const dataRows = mu.map((d) => ({ kind: d.kind, label: d.label, reference: d.reference, url: d.url }));
  const display = buildAnalysisDisplay({ row: row as never, name: "Micron Technology", assetType: "equity", plan: "free", cases: [], sources: [], dataSources: dataRows, factors: [] });
  cases.push(check("no news + data sources -> the page says so and lists the data, on Free", display.noNews === noNewsLine("Micron Technology", mu) && display.dataSources.length === 4, JSON.stringify({ noNews: display.noNews, n: display.dataSources.length })));
  const withNews = buildAnalysisDisplay({ row: row as never, name: "Micron Technology", assetType: "equity", plan: "free", cases: [], sources: [{ id: "n1", url: null }], dataSources: dataRows, factors: [] });
  cases.push(check("with news, no no-news line", withNews.noNews === null, String(withNews.noNews)));
  const legacy = buildAnalysisDisplay({ row: row as never, name: "semis", assetType: null, plan: "free", cases: [], sources: [], factors: [] });
  cases.push(check("an old row with no data sources keeps its old wording", legacy.noNews === null && legacy.dataSources.length === 0, String(legacy.noNews)));
  const rendered = renderComponentText("src/components/analysis/analysis-view.tsx", "AnalysisView", { display, sources: [], openBreakdown: "sources" });
  cases.push(
    check(
      "the Sources row renders the no-news line and every data source with its accession",
      rendered.includes("No recent news mentioning Micron Technology was found") && rendered.includes("Data the figures come from") && rendered.includes(`accession ${filing.accn}`) && rendered.includes("Yahoo Finance chart data"),
      rendered.slice(Math.max(0, rendered.indexOf("Sources") - 20), rendered.indexOf("Sources") + 600),
    ),
  );

  // --- 5. Wiring and what did not ship.
  const read = (p: string) => fs.readFileSync(path.resolve(p), "utf8");
  const generate = read("src/lib/ai/generate.ts");
  cases.push(check("generate.ts stores the data sources and takes the analysis back out if they fail to store", /from\("ai_analysis_data_sources"\)\.insert/.test(generate) && /sourcesError \|\| dataSourcesError \|\| analogsError/.test(generate), "insert + rollback"));
  cases.push(check("a ticker's sources count news plus data sources", /sourceCount: sourceIds\.length \+ dataSources\.length/.test(generate), "sourceCount"));
  const migration = read("supabase/migrations/0057_analysis_data_sources.sql");
  cases.push(check("migration 0057: service-role only (RLS on, grants revoked)", /enable row level security/.test(migration) && /revoke all on public\.ai_analysis_data_sources from anon, authenticated/.test(migration), "0057"));
  cases.push(check("attachMethodology reads data sources with the service role", /admin\.from\("ai_analysis_data_sources"\)/.test(read("src/lib/actions/analysis.ts")), "admin read"));
  const srcFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? srcFiles(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const perTicker = [...srcFiles("src"), ...srcFiles("supabase/functions")].filter((f) => /feeds\.finance\.yahoo\.com\/rss\/2\.0\/headline/.test(fs.readFileSync(f, "utf8")));
  cases.push(check("no per-ticker news fetch shipped while its terms are escalated", perTicker.length === 0 && fs.existsSync("docs/legal/2026-09-27-per-ticker-news-feed-terms.md"), perTicker.join(", ") || "none; escalation note present"));

  return { suiteName: "Analysis sources without tagged news", gating: true, cases };
}

async function main() {
  const suite = await runAnalysisSourcesSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name}${c.status === "pass" ? "" : `\n      ${c.detail}`}`);
  console.log(`Report written to ${writeReport([suite])}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
