// Orchestrates the gating checks into one combined, readable report.
//
// Exit code semantics (the previous version had only 0 and 1, and reported
// "All gating suites passed" while three of five suites had executed zero
// tests):
//   0  every gating suite ran and passed
//   1  a gating suite failed
//   2  a gating suite could not run (no model server, no analyses to inspect)
//
// 2 is deliberately not 0. A suite that did not run has told you nothing, and
// rolling it into a green summary is how the scope guard sat at a 20% catch
// rate under a passing CI signal.
import "./env";
import { writeReport, suiteVerdict, type SuiteResult } from "./report";
import { runAdversarialScopeGuardSuites } from "./adversarial-scope-guard";
import { runMethodologySubstanceSuite } from "./methodology-substance";
import { runCitationFreshnessSuite } from "./citation-freshness";
import { runProbabilityMathSuite } from "./probability-math";
import { runTaggingSuite } from "./tagging";
import { runScopeGuardProbeSuite } from "./scope-guard-probe";
import { runScopeClassifierSuite } from "./scope-classifier";
import { runMarketHoursSuite } from "./market-hours";
import { runContrastSuite } from "./contrast";
import { runEditorialSuite } from "./editorial";
import { runLlmBackoffSuite } from "./llm-backoff";
import { runReplyFormatSuite } from "./reply-format";
import { runMarkdownRenderSuite } from "./markdown-render";
import { runIntradayWindowSuite } from "./intraday-window";
import { runStripeWebhookSuite } from "./stripe-webhook";
import { runBriefingSummarySuite } from "./briefing-summary";
import { runBillingLimitsSuite } from "./billing-limits";
import { runSectorVocabularySuite } from "./sector-vocabulary";
import { runReadErrorsSuite } from "./read-errors";
import { runSplitFindingSuite } from "./split-finding";
import { runSettingsWiringSuite } from "./settings-wiring";
import { runWaitlistEmailSuite } from "./waitlist-email";

// A suite that throws (missing credentials, unreachable service) must surface
// as a hard failure of that suite, not take the whole run down with a stack
// trace that reports nothing about the suites that did run.
async function guarded(name: string, fn: () => Promise<SuiteResult[]> | SuiteResult[]): Promise<SuiteResult[]> {
  try {
    return await fn();
  } catch (err) {
    return [
      {
        suiteName: name,
        gating: true,
        cases: [
          {
            name: "suite failed to execute",
            status: "fail",
            detail: err instanceof Error ? err.message : String(err),
            attachment: err instanceof Error ? err.stack : undefined,
          },
        ],
      },
    ];
  }
}

async function main() {
  const [
    adversarialSuites,
    methodologySuites,
    citationSuites,
    taggingSuites,
    probeSuites,
    classifierSuites,
    marketHoursSuites,
    contrastSuites,
    editorialSuites,
    backoffSuites,
    replyFormatSuites,
    markdownRenderSuites,
    intradayWindowSuites,
    stripeWebhookSuites,
    briefingSummarySuites,
    billingLimitsSuites,
    sectorVocabularySuites,
    readErrorSuites,
    splitFindingSuites,
    settingsWiringSuites,
    waitlistEmailSuites,
  ] = await Promise.all([
    guarded("Adversarial scope guard", runAdversarialScopeGuardSuites),
    guarded("Methodology substance", async () => [await runMethodologySubstanceSuite()]),
    guarded("Citation freshness", async () => [await runCitationFreshnessSuite()]),
    guarded("News tagging", () => [runTaggingSuite()]),
    guarded("Scope guard probe", () => [runScopeGuardProbeSuite()]),
    guarded("Scope classifier", () => [runScopeClassifierSuite()]),
    guarded("Market hours", () => [runMarketHoursSuite()]),
    guarded("Palette contrast", () => [runContrastSuite()]),
    guarded("News editorial gate", () => [runEditorialSuite()]),
    guarded("LLM rate-limit retry policy", () => [runLlmBackoffSuite()]),
    guarded("Chat reply formatting", () => [runReplyFormatSuite()]),
    guarded("Chat markdown parser", () => [runMarkdownRenderSuite()]),
    guarded("Intraday chart windowing", () => [runIntradayWindowSuite()]),
    guarded("Stripe billing wiring", () => [runStripeWebhookSuite()]),
    guarded("Daily briefing summary", () => [runBriefingSummarySuite()]),
    guarded("Billing limits + formatting", () => [runBillingLimitsSuite()]),
    guarded("Sector vocabulary", () => [runSectorVocabularySuite()]),
    guarded("Supabase read errors", async () => [await runReadErrorsSuite()]),
    guarded("Analysis card title/description split", () => [runSplitFindingSuite()]),
    guarded("Settings control wiring", () => [runSettingsWiringSuite()]),
    guarded("Waitlist confirmation email", () => [runWaitlistEmailSuite()]),
  ]);

  const allSuites = [
    runProbabilityMathSuite(),
    ...adversarialSuites,
    ...methodologySuites,
    ...citationSuites,
    ...taggingSuites,
    ...probeSuites,
    ...classifierSuites,
    ...marketHoursSuites,
    ...contrastSuites,
    ...editorialSuites,
    ...backoffSuites,
    ...replyFormatSuites,
    ...markdownRenderSuites,
    ...intradayWindowSuites,
    ...stripeWebhookSuites,
    ...briefingSummarySuites,
    ...billingLimitsSuites,
    ...sectorVocabularySuites,
    ...readErrorSuites,
    ...splitFindingSuites,
    ...settingsWiringSuites,
    ...waitlistEmailSuites,
  ];
  const reportPath = writeReport(allSuites);

  console.log(`Combined report written to ${reportPath}\n`);
  for (const suite of allSuites) {
    const pass = suite.cases.filter((c) => c.status === "pass").length;
    const fail = suite.cases.filter((c) => c.status === "fail").length;
    const flag = suite.cases.filter((c) => c.status === "flag").length;
    const skip = suite.cases.filter((c) => c.status === "skip").length;
    console.log(
      `${suiteVerdict(suite).toUpperCase().padEnd(10)} ${suite.suiteName} (${suite.gating ? "gating" : "advisory"}): ` +
        `${pass} passed, ${fail} failed, ${flag} flagged, ${skip} skipped.`,
    );
  }

  const gating = allSuites.filter((s) => s.gating);
  const failed = gating.filter((s) => suiteVerdict(s) === "fail");
  const incomplete = gating.filter((s) => suiteVerdict(s) === "incomplete");

  console.log("");
  if (failed.length > 0) {
    console.error(`FAIL - ${failed.length} gating suite(s) failed: ${failed.map((s) => s.suiteName).join(", ")}`);
    if (incomplete.length > 0) {
      console.error(`       ${incomplete.length} more could not run: ${incomplete.map((s) => s.suiteName).join(", ")}`);
    }
    process.exit(1);
  }
  if (incomplete.length > 0) {
    console.error(
      `INCOMPLETE - ${incomplete.length} gating suite(s) executed no tests: ${incomplete
        .map((s) => s.suiteName)
        .join(", ")}`,
    );
    console.error("             Nothing failed, but nothing was proven either. This is not a pass.");
    process.exit(2);
  }
  console.log(`All ${gating.length} gating suites ran and passed.`);
}

main();
