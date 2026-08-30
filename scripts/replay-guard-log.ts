// Replays the REAL stored flagged outputs from ai_scope_guard_log through the
// CURRENT guard. This is the over-firing measurement: the earlier guard flagged
// 41 production outputs that were mostly the model correctly refusing, and the
// only honest way to know the fix held is to re-run the actual text.
import "./tests/env";

async function main() {
  const { checkScopeGuard } = await import("@/lib/ai/scope-guard");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const { data, error } = await db
    .from("ai_scope_guard_log")
    .select("id, raw_output, flag_reason, created_at, is_test")
    .eq("flagged", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const real = (data ?? []).filter((r) => !r.is_test);
  console.log(`Replaying ${real.length} real (non-test) production flags through the current guard\n`);

  const stillFlagged: typeof real = [];
  const nowPasses: typeof real = [];
  for (const row of real) {
    const res = checkScopeGuard(String(row.raw_output ?? ""));
    if (res.passed) nowPasses.push(row);
    else {
      stillFlagged.push(row);
      console.log(`STILL FLAGGED [${String(row.created_at).slice(0, 10)}] was=${row.flag_reason} now=${res.reason}`);
      console.log(`  evidence: ${String(res.evidence ?? "").slice(0, 160).replace(/\s+/g, " ")}`);
      console.log(`  text:     ${String(row.raw_output).slice(0, 160).replace(/\s+/g, " ")}\n`);
    }
  }

  console.log(`--- current guard vs ${real.length} historical production flags ---`);
  console.log(`now PASSES (over-fire corrected): ${nowPasses.length}`);
  console.log(`still flagged:                    ${stillFlagged.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
