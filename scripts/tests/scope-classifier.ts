// Unit tests for the scope classifier's decision logic.
//
// The network call itself cannot be tested without an inference server, and
// this suite does not pretend otherwise -- it covers the parts that decide
// what happens to a response, which are deliberately factored out as pure
// functions precisely so they are testable: reply validation, verdict
// interpretation, and the fail-open/fail-closed resolution.
//
// The point of the validation cases is that a malformed or hostile reply from
// the model must not read as "clear". A classifier that silently treats a
// parse failure as approval is worse than no classifier, because it looks like
// a guard on the org chart and is a pass-through in production.
//
// Run: npx tsx scripts/tests/scope-classifier.ts

import { isClassifierReply, interpretReply, resolveUnavailable } from "../../src/lib/ai/scope-classifier";
import type { SuiteResult, TestCase } from "./report";

const cases: TestCase[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  cases.push({
    name,
    status: ok ? "pass" : "fail",
    detail: ok ? "as expected" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  });
}

// --- reply validation: anything not matching the contract must be rejected --
check("valid clear reply is accepted", isClassifierReply({ verdict: "clear", reason: "n/a", rationale: "descriptive" }), true);
check("valid flagged reply is accepted", isClassifierReply({ verdict: "flagged", reason: "directive", rationale: "tells reader to sell" }), true);
check("missing rationale is rejected", isClassifierReply({ verdict: "clear", reason: "n/a" }), false);
check("unknown verdict is rejected", isClassifierReply({ verdict: "maybe", reason: "x", rationale: "y" }), false);
check("null is rejected", isClassifierReply(null), false);
check("bare string is rejected", isClassifierReply("clear"), false);
check("empty object is rejected", isClassifierReply({}), false);
check("verdict as boolean is rejected", isClassifierReply({ verdict: true, reason: "x", rationale: "y" }), false);

// --- verdict interpretation ------------------------------------------------
check("clear verdict yields clear outcome", interpretReply({ verdict: "clear", reason: "n/a", rationale: "descriptive" }), { status: "clear" });
check(
  "flagged verdict yields a namespaced reason",
  interpretReply({ verdict: "flagged", reason: "second_person", rationale: "tells the reader to sell" }),
  { status: "flagged", reason: "classifier:second_person", rationale: "tells the reader to sell" },
);
check(
  "flagged verdict with empty reason still flags under a default slug",
  interpretReply({ verdict: "flagged", reason: "", rationale: "instructs the reader" }),
  { status: "flagged", reason: "classifier:personal_direction", rationale: "instructs the reader" },
);

// --- unavailable resolution ------------------------------------------------
const advisory = resolveUnavailable("advisory", "connection refused");
check("advisory mode does not block when classifier is down", advisory.blocked, false);
check("advisory mode still records why", advisory.note.includes("connection refused"), true);

const strict = resolveUnavailable("strict", "connection refused");
check("strict mode blocks when classifier is down", strict.blocked, true);
check("strict mode records why", strict.note.includes("connection refused"), true);

check("off mode resolves like advisory when reached", resolveUnavailable("off", "n/a").blocked, false);

export function runScopeClassifierSuite(): SuiteResult {
  return { suiteName: "Scope classifier (layer 3 decision logic)", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("scope-classifier.ts")) {
  for (const c of cases) console.log(`${c.status === "pass" ? "ok  " : "FAIL"} ${c.name} - ${c.detail}`);
  const failed = cases.filter((c) => c.status === "fail").length;
  console.log(`\n${cases.length - failed}/${cases.length} classifier cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
