// Section 7, test 3: citation freshness check (gating on the "impossible
// timestamp" case - a cited source published after its own analysis is a
// hard hallucination signal; staleness beyond the recency window is
// reported but non-gating, since an old article can still be a legitimate
// input to a historical-pattern analysis in edge cases).
import "./env";
import { pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";
import { createAdminClient } from "@/lib/supabase/admin";

const RECENCY_WINDOW_DAYS = 90;
const SAMPLE_TICKER_LIMIT = 10;

export async function runCitationFreshnessSuite(): Promise<SuiteResult> {
  const admin = createAdminClient();
  const cases: TestCase[] = [];
  const notes: string[] = [];

  const { data: scopeRows } = await admin
    .from("ai_analyses")
    .select("scope_value")
    .eq("scope_type", "ticker")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(200);

  const tickers = Array.from(new Set((scopeRows ?? []).map((r) => r.scope_value))).slice(0, SAMPLE_TICKER_LIMIT);

  if (tickers.length === 0) {
    notes.push("No validated ticker-level analyses exist yet - nothing to sample for citation freshness.");
  }

  for (const ticker of tickers) {
    const { data: analyses } = await admin
      .from("ai_analyses")
      .select("id, created_at")
      .eq("scope_type", "ticker")
      .eq("scope_value", ticker)
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1);

    const analysis = analyses?.[0];
    if (!analysis) continue;

    const { data: links } = await admin
      .from("ai_analysis_sources")
      .select("news_item_id")
      .eq("analysis_id", analysis.id);

    const newsIds = (links ?? []).map((l) => l.news_item_id);
    if (newsIds.length === 0) {
      cases.push({
        name: `${ticker} (${analysis.id})`,
        status: "fail",
        detail: "No cited sources to check - checkCompleteness should have rejected this at generation time.",
      });
      continue;
    }

    const { data: newsItems } = await admin.from("news_items").select("id, title, published_at").in("id", newsIds);
    const analysisCreated = new Date(analysis.created_at).getTime();
    const windowStart = analysisCreated - RECENCY_WINDOW_DAYS * 86_400_000;

    const impossible = (newsItems ?? []).filter((n) => new Date(n.published_at).getTime() > analysisCreated);
    const stale = (newsItems ?? []).filter(
      (n) => new Date(n.published_at).getTime() <= analysisCreated && new Date(n.published_at).getTime() < windowStart,
    );

    if (impossible.length > 0) {
      cases.push({
        name: `${ticker} (${analysis.id})`,
        status: "fail",
        detail: `${impossible.length} cited source(s) published AFTER the analysis was created - impossible/hallucinated citation.`,
        attachment: JSON.stringify(impossible, null, 2),
      });
      continue;
    }

    if (stale.length > 0) {
      cases.push({
        name: `${ticker} (${analysis.id})`,
        status: "flag",
        detail: `${stale.length}/${newsItems?.length ?? 0} cited source(s) are older than the ${RECENCY_WINDOW_DAYS}-day recency window - review for staleness.`,
        attachment: JSON.stringify(stale, null, 2),
      });
      continue;
    }

    cases.push({
      name: `${ticker} (${analysis.id})`,
      status: "pass",
      detail: `${newsItems?.length ?? 0} cited source(s), all within ${RECENCY_WINDOW_DAYS} days and no future timestamps.`,
    });
  }

  return { suiteName: "Citation freshness check", gating: true, cases, notes };
}

async function main() {
  const suite = await runCitationFreshnessSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  console.log(
    `${suite.cases.filter((c) => c.status === "pass").length} passed, ${suite.cases.filter((c) => c.status === "fail").length} failed, ` +
      `${suite.cases.filter((c) => c.status === "flag").length} flagged, out of ${suite.cases.length}.`,
  );
  if (suite.cases.some((c) => c.status === "fail")) {
    console.error("FAIL - at least one impossible/hallucinated citation timestamp found.");
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
