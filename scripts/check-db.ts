// Verifies the database actually has everything the app expects - most
// usefully, whether the pending migrations have been applied. Run with:
//   npx tsx scripts/check-db.ts
//
// Exists because a missing migration surfaces at runtime as an opaque
// "Failed to fetch" in the browser rather than anything that points at the
// real cause.
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";

interface Check {
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

async function main() {
  const admin = createAdminClient();
  const checks: Check[] = [];

  // Tables the app reads/writes at runtime.
  const tables: { name: string; fix?: string }[] = [
    { name: "subscriptions" },
    { name: "ai_usage_events" },
    { name: "chat_usage_events", fix: "supabase/migrations/0014_chat_usage_gate.sql" },
    { name: "ai_analyses" },
    { name: "ai_scope_guard_log" },
    { name: "chat_sessions" },
    { name: "chat_messages" },
    { name: "daily_briefings" },
    { name: "news_items" },
    { name: "historical_prices" },
    { name: "historical_events" },
    { name: "data_providers" },
  ];

  for (const t of tables) {
    const { error, count } = await admin.from(t.name as never).select("*", { count: "exact", head: true });
    checks.push({
      label: `table ${t.name}`,
      ok: !error,
      detail: error ? error.message : `present (${count ?? 0} rows)`,
      fix: error ? t.fix : undefined,
    });
  }

  // Columns added by 0013 - a missing one breaks scope-guard audit logging.
  const { error: guardColsError } = await admin
    .from("ai_scope_guard_log")
    .select("corrected_output, source_surface")
    .limit(1);
  checks.push({
    label: "ai_scope_guard_log.corrected_output + source_surface",
    ok: !guardColsError,
    detail: guardColsError ? guardColsError.message : "present",
    fix: guardColsError ? "supabase/migrations/0013_scope_guard_hardening.sql" : undefined,
  });

  // Column added by 0015 - without it, test runs pollute the compliance audit trail.
  const { error: isTestError } = await admin.from("ai_scope_guard_log").select("is_test").limit(1);
  checks.push({
    label: "ai_scope_guard_log.is_test",
    ok: !isTestError,
    detail: isTestError ? isTestError.message : "present",
    fix: isTestError ? "supabase/migrations/0015_scope_guard_test_marker.sql" : undefined,
  });

  // The CoinGecko provider row ingest-crypto now reads instead of a hardcoded URL.
  const { data: coingecko } = await admin
    .from("data_providers")
    .select("name, enabled")
    .contains("config", { adapter: "coingecko" })
    .maybeSingle();
  checks.push({
    label: "data_providers CoinGecko row",
    ok: Boolean(coingecko),
    detail: coingecko ? `present (enabled=${coingecko.enabled})` : "missing",
    fix: coingecko ? undefined : "supabase/seed/providers.sql",
  });

  let failed = 0;
  for (const c of checks) {
    if (c.ok) {
      console.log(`  OK   ${c.label} - ${c.detail}`);
    } else {
      failed++;
      console.error(`  FAIL ${c.label} - ${c.detail}`);
      if (c.fix) console.error(`       fix: run ${c.fix}`);
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed} check(s) failed. Apply the SQL files listed above via the Supabase SQL editor.`);
    process.exit(1);
  }
  console.log("All database checks passed.");
}

main();
