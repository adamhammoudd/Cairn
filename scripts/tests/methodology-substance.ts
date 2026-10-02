// Section 7, test 2: methodology substance check (semi-automated, advisory -
// not gating). For a sample of 10-15 generated analyses: asserts cited
// sources exist and are relevant to the analysis's scope, and flags (for
// human review, not an automatic fail) any sample whose confidence framing
// looks uniformly high rather than honestly varied.
import "./env";
import { pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasLiveDb, liveDbSkipped } from "./live-db";

const SAMPLE_SIZE = 15;
const MIN_SAMPLE_FOR_CONFIDENCE_CHECK = 10;

export async function runMethodologySubstanceSuite(): Promise<SuiteResult> {
  if (!hasLiveDb()) return liveDbSkipped("Methodology substance", "stored analyses cite real, relevant sources");
  const admin = createAdminClient();
  const cases: TestCase[] = [];
  const notes: string[] = [];

  const { data: analyses } = await admin
    .from("ai_analyses")
    .select("id, scope_type, scope_value, confidence_level, created_at")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(SAMPLE_SIZE);

  const sample = analyses ?? [];
  if (sample.length < MIN_SAMPLE_FOR_CONFIDENCE_CHECK) {
    notes.push(
      `Only ${sample.length} validated analyses exist in this database - below the 10-15 sample the spec calls for. ` +
        `Run ingestion + generate a few analyses via the Research page, then re-run this check for a meaningful sample.`,
    );
  }

  const ids = sample.map((a) => a.id);
  const [{ data: sourceLinks }, newsRows] = await Promise.all([
    ids.length > 0
      ? admin.from("ai_analysis_sources").select("analysis_id, news_item_id").in("analysis_id", ids)
      : Promise.resolve({ data: [] as { analysis_id: string; news_item_id: string }[] }),
    Promise.resolve(null),
  ]);
  void newsRows;

  // Data sources (migration 0057): price history, SEC filings, fund profile.
  // checkCompleteness counts these alongside news (generate.ts), so an
  // analysis citing only them is complete, not "uncited".
  const { data: dataSourceRows } =
    ids.length > 0
      ? await admin.from("ai_analysis_data_sources").select("analysis_id, kind").in("analysis_id", ids)
      : { data: [] as { analysis_id: string; kind: string }[] };

  const newsIds = Array.from(new Set((sourceLinks ?? []).map((s) => s.news_item_id)));
  const { data: newsItems } =
    newsIds.length > 0
      ? await admin.from("news_items").select("id, title, tickers, sectors").in("id", newsIds)
      : { data: [] as { id: string; title: string; tickers: string[]; sectors: string[] }[] };
  const newsById = new Map((newsItems ?? []).map((n) => [n.id, n]));

  for (const analysis of sample) {
    const links = (sourceLinks ?? []).filter((s) => s.analysis_id === analysis.id);

    if (links.length === 0) {
      const data = (dataSourceRows ?? []).filter((d) => d.analysis_id === analysis.id);
      cases.push({
        name: `${analysis.scope_type}/${analysis.scope_value} (${analysis.id})`,
        status: data.length > 0 ? "pass" : "fail",
        detail:
          data.length > 0
            ? `No news cited; ${data.length} data source(s) cited (${Array.from(new Set(data.map((d) => d.kind))).join(", ")}).`
            : "No cited sources found (no news, no data sources) - checkCompleteness should have rejected this at generation time.",
      });
      continue;
    }

    const missing = links.filter((l) => !newsById.has(l.news_item_id));
    if (missing.length > 0) {
      cases.push({
        name: `${analysis.scope_type}/${analysis.scope_value} (${analysis.id})`,
        status: "fail",
        detail: `${missing.length} cited source id(s) don't exist in news_items - hallucinated or orphaned citation.`,
        attachment: JSON.stringify(missing, null, 2),
      });
      continue;
    }

    const irrelevant = links
      .map((l) => newsById.get(l.news_item_id)!)
      .filter((n) => {
        if (analysis.scope_type === "market") return false; // market-level has no ticker/sector to match
        const scopeValues = analysis.scope_type === "ticker" ? n.tickers : n.sectors;
        return !(scopeValues ?? []).includes(analysis.scope_value);
      });

    cases.push({
      name: `${analysis.scope_type}/${analysis.scope_value} (${analysis.id})`,
      status: irrelevant.length > 0 ? "flag" : "pass",
      detail:
        irrelevant.length > 0
          ? `${irrelevant.length}/${links.length} cited source(s) don't obviously tag this scope - human review recommended.`
          : `${links.length} source(s) cited, all tagged to this scope.`,
      attachment: irrelevant.length > 0 ? JSON.stringify(irrelevant, null, 2) : undefined,
    });
  }

  if (sample.length >= MIN_SAMPLE_FOR_CONFIDENCE_CHECK) {
    const lowCount = sample.filter((a) => a.confidence_level === "low").length;
    if (lowCount === 0) {
      cases.push({
        name: "confidence-level distribution",
        status: "flag",
        detail:
          `Zero of ${sample.length} sampled analyses are "low" confidence - flagged for human review per spec ` +
          `("flag any analysis whose confidence framing looks uniformly high rather than honestly varied"). ` +
          `Not an automatic failure: it may be genuinely warranted by the data, but is worth a manual look.`,
      });
    } else {
      cases.push({
        name: "confidence-level distribution",
        status: "pass",
        detail: `${lowCount}/${sample.length} sampled analyses are "low" confidence - some variation present.`,
      });
    }
  }

  return { suiteName: "Methodology substance check", gating: false, cases, notes };
}

async function main() {
  const suite = await runMethodologySubstanceSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  console.log(
    `${suite.cases.filter((c) => c.status === "pass").length} passed, ${suite.cases.filter((c) => c.status === "fail").length} failed, ` +
      `${suite.cases.filter((c) => c.status === "flag").length} flagged, out of ${suite.cases.length}.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
