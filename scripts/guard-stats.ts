// Scope-guard rewrite-rate report. This is the number to watch after
// switching to a self-hosted model: a small model trips the guard more often
// than a large one, and a high rewrite rate means users are seeing the
// templated fallback instead of a real answer.
//
// Run with: npx tsx scripts/guard-stats.ts
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const admin = createAdminClient();

  // Real events only — the adversarial suite marks its own rows is_test so
  // synthetic violations never distort this (see migration 0015).
  const { data: rows, error } = await admin
    .from("ai_scope_guard_log")
    .select("flag_reason, source_surface, created_at")
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .limit(1000);

  const { count: testCount } = await admin
    .from("ai_scope_guard_log")
    .select("*", { count: "exact", head: true })
    .eq("is_test", true);

  if (error) {
    console.error(`Could not read ai_scope_guard_log: ${error.message}`);
    process.exit(1);
  }

  const all = rows ?? [];
  if (testCount) console.log(`(excluding ${testCount} test-originated row(s))\n`);

  if (all.length === 0) {
    console.log("No real scope-guard events logged yet.");
    return;
  }

  const bySurface = new Map<string, number>();
  const byReason = new Map<string, number>();
  for (const r of all) {
    bySurface.set(r.source_surface, (bySurface.get(r.source_surface) ?? 0) + 1);
    const reason = r.flag_reason ?? "(none)";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }

  console.log(`Total flagged/rewritten events: ${all.length}`);
  console.log(`Most recent: ${all[0].created_at}\n`);

  console.log("By surface:");
  for (const [surface, count] of [...bySurface].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${surface.padEnd(10)} ${count}`);
  }

  console.log("\nBy reason:");
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(32)} ${count}`);
  }

  // Chat rewrite rate against actual chat volume, which is the number that
  // decides whether the deployed model is strong enough.
  const chatFlagged = bySurface.get("chat") ?? 0;
  const { count: chatTotal } = await admin
    .from("chat_usage_events")
    .select("*", { count: "exact", head: true });

  if (chatTotal && chatTotal > 0) {
    const rate = ((chatFlagged / chatTotal) * 100).toFixed(0);
    console.log(`\nChat rewrite rate: ${chatFlagged}/${chatTotal} real chat turns (${rate}%)`);
    console.log(
      "This is the number that decides whether the deployed model is strong enough. A high rate " +
        "means users are frequently getting the templated fallback instead of a real answer — the " +
        "fix for that is a larger model, never a looser guard.",
    );
  }
}

main();
