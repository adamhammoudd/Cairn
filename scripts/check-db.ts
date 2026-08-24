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
    { name: "symbol_directory", fix: "supabase/migrations/0027_on_demand_ingestion.sql" },
    { name: "symbol_profiles", fix: "supabase/migrations/0028_profiles_statements_moderation.sql" },
    { name: "financial_statements", fix: "supabase/migrations/0028_profiles_statements_moderation.sql" },
    { name: "option_contracts", fix: "supabase/migrations/0028_profiles_statements_moderation.sql" },
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

  // schema.sql gained these two directly (2f9c718, 2e5075b) without ever
  // getting a migration, so a project built from the numbered migrations
  // alone - as opposed to a fresh `schema.sql` run - never received them.
  // dashboard_layout is what surfaces first: saving a custom dashboard
  // layout fails with "Could not find the 'dashboard_layout' column of
  // 'user_settings' in the schema cache" the moment anyone tries it.
  const { error: dashboardLayoutError } = await admin.from("user_settings").select("dashboard_layout").limit(1);
  checks.push({
    label: "user_settings.dashboard_layout",
    ok: !dashboardLayoutError,
    detail: dashboardLayoutError ? dashboardLayoutError.message : "present",
    fix: dashboardLayoutError ? "supabase/migrations/0030_schema_sql_drift.sql" : undefined,
  });

  const { error: watchlistPrefsError } = await admin.from("watchlists").select("description, display_prefs").limit(1);
  checks.push({
    label: "watchlists.description + display_prefs",
    ok: !watchlistPrefsError,
    detail: watchlistPrefsError ? watchlistPrefsError.message : "present",
    fix: watchlistPrefsError ? "supabase/migrations/0030_schema_sql_drift.sql" : undefined,
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

  // Database functions. Since 0027 every price read in the app goes through
  // these instead of querying historical_prices directly, so a project that
  // never ran 0027/0028 serves an empty Markets page, a $0 portfolio and a
  // ticker with no stats - all at once, and with no error on screen. That is
  // exactly the failure this script exists to name in one command.
  const rpcs: { name: string; args: Record<string, unknown>; fix: string; used_by: string }[] = [
    {
      name: "recent_prices",
      args: { symbols: ["AAPL"], per_symbol: 1 },
      fix: "supabase/migrations/0027_on_demand_ingestion.sql",
      used_by: "Portfolio, ticker, dashboard, watchlists, sector map",
    },
    {
      name: "recent_prices_all",
      args: { per_symbol: 1 },
      fix: "supabase/migrations/0027_on_demand_ingestion.sql",
      used_by: "Markets, Screener, crypto overview",
    },
    {
      name: "search_symbols",
      args: { prefix: "AA", max_results: 1 },
      fix: "supabase/migrations/0027_on_demand_ingestion.sql",
      used_by: "header search, Research scope picker",
    },
    {
      name: "symbol_52w_range",
      args: {},
      fix: "supabase/migrations/0028_profiles_statements_moderation.sql",
      used_by: "Screener 52-week columns",
    },
  ];

  for (const r of rpcs) {
    const { error } = await admin.rpc(r.name as never, r.args as never);
    checks.push({
      label: `function ${r.name}()`,
      ok: !error,
      detail: error ? `${error.message} - breaks: ${r.used_by}` : "callable",
      fix: error ? r.fix : undefined,
    });
  }

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
