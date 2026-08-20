// Orchestrates all three Section 7 checks into one combined, readable
// report. Exit code reflects only the gating suites (adversarial scope-guard,
// citation freshness) - methodology substance is advisory per spec and never
// fails the run, only flags for human review.
import "./env";
import { writeReport, suitePassed } from "./report";
import { runAdversarialScopeGuardSuites } from "./adversarial-scope-guard";
import { runMethodologySubstanceSuite } from "./methodology-substance";
import { runCitationFreshnessSuite } from "./citation-freshness";
import { runProbabilityMathSuite } from "./probability-math";

async function main() {
  const [adversarialSuites, methodologySuite, citationSuite] = await Promise.all([
    runAdversarialScopeGuardSuites(),
    runMethodologySubstanceSuite(),
    runCitationFreshnessSuite(),
  ]);

  const allSuites = [runProbabilityMathSuite(), ...adversarialSuites, methodologySuite, citationSuite];
  const reportPath = writeReport(allSuites);

  console.log(`Combined report written to ${reportPath}\n`);
  for (const suite of allSuites) {
    const pass = suite.cases.filter((c) => c.status === "pass").length;
    const fail = suite.cases.filter((c) => c.status === "fail").length;
    const flag = suite.cases.filter((c) => c.status === "flag").length;
    const skip = suite.cases.filter((c) => c.status === "skip").length;
    console.log(
      `${suitePassed(suite) ? "PASS" : "FAIL"} - ${suite.suiteName} (${suite.gating ? "gating" : "advisory"}): ` +
        `${pass} passed, ${fail} failed, ${flag} flagged, ${skip} skipped.`,
    );
  }

  const gatingFailed = allSuites.filter((s) => s.gating).some((s) => !suitePassed(s));
  if (gatingFailed) {
    console.error("\nFAIL - one or more gating suites did not pass. See report for details.");
    process.exit(1);
  }
  console.log("\nAll gating suites passed.");
}

main();
