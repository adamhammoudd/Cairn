// Regenerate the stored analyses with the rebuilt pipeline
// (chore/regenerate-analyses, docs/decisions/2026-09-27-analysis-rebuild.md).
//
// One new analysis per scope - the stored rows are repeat runs of a handful of
// symbols, and regenerating each would only store the same answer several
// times. Every older row of that scope is then marked superseded_by the new
// one (migration 0054). Nothing is deleted.
//
//   DRY RUN (default): no database writes at all. Prints, as Markdown, every
//   stored analysis and, per scope, the old headline and range beside the new
//   text and history line, built by the same inputs and guards as production
//   (scripts/analysis-dry-run.ts).
//
//   --apply: [DECISION: Adam] only after the dry run is approved, and only
//   once migrations 0052 and 0054 are live (checked first). Writes through
//   generateAnalysis(), exactly as the app does.
//
// Run: npx tsx --conditions=react-server scripts/regenerate-analyses.ts [--apply] > regeneration.md
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { dryRunTicker } from "./analysis-dry-run";
import { historyWords } from "@/lib/ai/analysis-text";

interface OldRow {
  id: string;
  scope_type: string;
  scope_value: string;
  created_at: string;
  probability_low: number;
  probability_high: number;
  confidence_level: string;
  sample_size: number;
  reasoning_text: string;
  plain_summary: { headline?: string } | null;
}

function oldHeadline(r: OldRow): string {
  if (r.plain_summary?.headline) return r.plain_summary.headline;
  const m = r.reasoning_text.match(/^([\s\S]*?[.!?])(\s|$)/);
  return (m ? m[1] : r.reasoning_text).trim();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = createAdminClient();

  // Columns that exist before 0052/0054, so the dry run works on today's database.
  const { data, error } = await db
    .from("ai_analyses")
    .select("id, scope_type, scope_value, created_at, probability_low, probability_high, confidence_level, sample_size, reasoning_text, plain_summary")
    .eq("status", "validated")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to read analyses: ${error.message}`);
  let rows = (data ?? []) as unknown as OldRow[];

  if (apply) {
    const probe = await db.from("ai_analyses").select("headline, superseded_by").limit(1);
    if (probe.error) throw new Error(`Refusing --apply: migrations 0052 and 0054 must be applied first (${probe.error.message}).`);
    // Already-superseded rows are not regenerated again.
    const { data: current } = await db.from("ai_analyses").select("id").eq("status", "validated").is("superseded_by", null);
    const live = new Set((current ?? []).map((r) => r.id));
    rows = rows.filter((r) => live.has(r.id));
  }

  const scopes = new Map<string, OldRow[]>();
  for (const r of rows) {
    const k = `${r.scope_type}:${r.scope_value}`;
    scopes.set(k, [...(scopes.get(k) ?? []), r]);
  }

  console.log(`# Regenerating stored analyses - ${apply ? "APPLY" : "DRY RUN (nothing written)"}\n`);
  console.log(`${rows.length} validated analyses across ${scopes.size} scopes. One new analysis per scope; every older row is marked superseded by it.\n`);
  console.log("| # | Stored | Scope | Old headline | Old range (±5% move) | Replaced by |\n|---|---|---|---|---|---|");
  rows.forEach((r, i) =>
    console.log(`| ${i + 1} | ${r.created_at.slice(0, 16).replace("T", " ")} | ${r.scope_value} | ${oldHeadline(r).replace(/\|/g, "/").slice(0, 110)} | ${r.probability_low}–${r.probability_high}% (${r.confidence_level}, n=${r.sample_size}) | new ${r.scope_value} analysis |`),
  );

  for (const [key, olds] of scopes) {
    const [scopeType, scopeValue] = key.split(":");
    const latest = olds[olds.length - 1];
    console.log(`\n## ${scopeValue}\n\n**Before** (latest of ${olds.length}): ${oldHeadline(latest)} · ${latest.probability_low}–${latest.probability_high}% chance of a ≥5% move, ${latest.confidence_level} confidence\n`);
    if (scopeType !== "ticker") {
      console.log("Skipped: sector and market analyses keep the original pipeline.\n");
      continue;
    }

    if (!apply) {
      const r = await dryRunTicker(scopeValue);
      if (!r.inputs || !r.generated) {
        console.log(`**After:** not generated - ${r.skipped}\n`);
        continue;
      }
      const hw = historyWords(r.inputs.history, r.inputs.name, r.inputs.assetType, r.inputs.noHistoryReason)!;
      const g = r.generated;
      console.log(`**After** (${g.source}${g.attempts.length ? `; rejected drafts: ${g.attempts.map((a) => a.reason).join(", ")}` : ""}):\n`);
      console.log(`> ${g.text.headline}\n>\n${g.text.bullets.map((b) => `> - ${b}`).join("\n")}\n`);
      console.log(`History: ${hw.line}${hw.range ? ` ${hw.range}` : ""} ${hw.confidence}\n`);
      console.log(`Watch: ${g.text.watch.map((w) => w.text).join(" · ") || "(none)"}\n`);
      continue;
    }

    const { generateAnalysis } = await import("@/lib/ai/generate");
    const fresh = await generateAnalysis({ scopeType: "ticker", scopeValue, supabaseClient: db });
    const { error: supErr } = await db
      .from("ai_analyses")
      .update({ superseded_by: fresh.id, superseded_at: new Date().toISOString() })
      .in("id", olds.map((o) => o.id));
    if (supErr) throw new Error(`Stored ${fresh.id} for ${scopeValue} but could not mark the old rows superseded: ${supErr.message}`);
    console.log(`**After:** stored ${fresh.id} (${(fresh as { text_source?: string }).text_source ?? "?"}); ${olds.length} older rows marked superseded.\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
