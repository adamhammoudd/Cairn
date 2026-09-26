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
import { runFactorAnalogsSuite } from "./factor-analogs";
import { runDeepHistorySuite } from "./deep-history";
import { runFundamentalsSuite } from "./fundamentals";
import { runScorecardSuite } from "./scorecard";
import { runHistoryPlainSuite } from "./history-plain";
import { runExposureSuite } from "./exposure";
import { runDailyBriefingSuite } from "./daily-briefing";
import { runPlainSummarySuite } from "./plain-summary";
import { runPriceRowCapSuite } from "./price-row-cap";
import { runAssetClassIdentitySuite } from "./asset-class-identity";
import { runResearchDropdownStackingSuite } from "./research-dropdown-stacking";
import { runTaggingSuite } from "./tagging";
import { runScopeGuardProbeSuite } from "./scope-guard-probe";
import { runPortfolioFigureDriftSuite } from "./portfolio-figure-drift";
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
import { runProxyPublicPathsSuite } from "./proxy-public-paths";
import { runSignupConsentSuite } from "./signup-consent";
import { runLiveRefreshSuite } from "./live-refresh";
import { runWaitlistBetaCopySuite } from "./waitlist-beta-copy";
import { runPremiumAnalogsPrivateSuite } from "./premium-analogs-private";
import { runAiMethodologyGapsSuite } from "./ai-methodology-gaps";
import { runFxRatesSuite } from "./fx-rates";
import { runBriefingOnOpenSuite } from "./briefing-on-open";
import { runCalendarIngestSuite } from "./calendar-ingest";
import { runSplitAdjustmentSuite } from "./split-adjustment";
import { runHealthInputsSuite } from "./health-inputs";
import { runPortfolioHistoryReadSuite } from "./portfolio-history-read";
import { runRunAllRegistrationSuite } from "./run-all-registration";
import { runDirectionEngineSuite } from "./direction-engine";
import { runAnalysisTextSuite } from "./analysis-text";

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
    portfolioFigureDriftSuites,
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
    proxyPublicPathsSuites,
    signupConsentSuites,
    liveRefreshSuites,
    priceRowCapSuites,
    plainSummarySuites,
    aiMethodologyGapsSuites,
    fxRatesSuites,
    portfolioHistorySuites,
    briefingOnOpenSuites,
    analysisTextSuites,
  ] = await Promise.all([
    guarded("Adversarial scope guard", runAdversarialScopeGuardSuites),
    guarded("Methodology substance", async () => [await runMethodologySubstanceSuite()]),
    guarded("Citation freshness", async () => [await runCitationFreshnessSuite()]),
    guarded("News tagging", () => [runTaggingSuite()]),
    guarded("Scope guard probe", () => [runScopeGuardProbeSuite()]),
    guarded("Portfolio figure drift", () => [runPortfolioFigureDriftSuite()]),
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
    guarded("Waitlist gate allowlist", () => [runProxyPublicPathsSuite()]),
    guarded("Signup consent", async () => [await runSignupConsentSuite()]),
    guarded("Live-quote polling", () => [runLiveRefreshSuite()]),
    guarded("Price reads past the 1000-row API cap", async () => [await runPriceRowCapSuite()]),
    guarded("Plain summary", async () => [await runPlainSummarySuite()]),
    guarded("AI methodology gaps", async () => [await runAiMethodologyGapsSuite()]),
    guarded("Display currency", async () => [await runFxRatesSuite()]),
    guarded("Portfolio chart history read", async () => [await runPortfolioHistoryReadSuite()]),
    guarded("Daily briefing built on open", async () => [await runBriefingOnOpenSuite()]),
    guarded("Analysis text", async () => [await runAnalysisTextSuite()]),
  ]);

  const allSuites = [
    runProbabilityMathSuite(),
    runFactorAnalogsSuite(),
    runDeepHistorySuite(),
    runFundamentalsSuite(),
    runWaitlistBetaCopySuite(),
    runPremiumAnalogsPrivateSuite(),
    runCalendarIngestSuite(),
    runSplitAdjustmentSuite(),
    runHealthInputsSuite(),
    runRunAllRegistrationSuite(),
    runScorecardSuite(),
    runHistoryPlainSuite(),
    runDirectionEngineSuite(),
    runExposureSuite(),
    runDailyBriefingSuite(),
    runAssetClassIdentitySuite(),
    runResearchDropdownStackingSuite(),
    ...adversarialSuites,
    ...methodologySuites,
    ...citationSuites,
    ...taggingSuites,
    ...probeSuites,
    ...portfolioFigureDriftSuites,
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
    ...proxyPublicPathsSuites,
    ...signupConsentSuites,
    ...liveRefreshSuites,
    ...priceRowCapSuites,
    ...plainSummarySuites,
    ...aiMethodologyGapsSuites,
    ...fxRatesSuites,
    ...portfolioHistorySuites,
    ...briefingOnOpenSuites,
    ...analysisTextSuites,
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
