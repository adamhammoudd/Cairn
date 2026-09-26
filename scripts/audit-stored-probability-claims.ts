// Runs the freelanced-probability check (checkNoFreelancedProbability, via
// checkAnalysisProbabilityClaims) over every stored, validated analysis.
// generate.ts did not run it before fix/ai-methodology-gaps, so rows written
// earlier were never checked. Read-only: prints what it finds, changes nothing.
//
//   npx tsx --conditions=react-server scripts/audit-stored-probability-claims.ts
//
// The stored row keeps the computed band (probability_low/high) but not the
// base rate the prompt was also given, so a flagged row may only be restating
// that base rate: flagged rows need a human read, not automatic removal.
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnalysisProbabilityClaims } from "@/lib/ai/scope-guard";

async function main() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_analyses")
    .select("id, scope_type, scope_value, probability_low, probability_high, reasoning_text, created_at")
    .eq("status", "validated")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const flagged = rows
    .map((r) => ({ r, res: checkAnalysisProbabilityClaims(r.reasoning_text ?? "", { low: Number(r.probability_low), high: Number(r.probability_high), pointEstimate: null }) }))
    .filter(({ res }) => !res.passed);
  console.log(`Checked ${rows.length} validated analyses; ${flagged.length} state a probability outside their stored band.`);
  for (const { r, res } of flagged) {
    console.log(`- ${r.id} ${r.scope_type}:${r.scope_value} ${r.created_at.slice(0, 10)} band ${r.probability_low}-${r.probability_high}%: ${res.reason ?? ""} ${res.evidence ? `"${res.evidence}"` : ""}`);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
