"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Role-gated operational view (roadmap Phase 11: "Admin/Dev Utilities:
// Role-gated route for data refresh status, rate-limit usage, error logs -
// extend to include Phase 4 engine health (analog-match rates, confidence
// distribution over time) since that's now the core product to monitor").
//
// Everything here is counted from real rows. Nothing is sampled, estimated or
// carried forward from a previous run.

export interface IngestionHealth {
  total: number;
  byStatus: { status: string; count: number }[];
  staleCount: number;
  /** The symbols the daily refresh has gone longest without touching. */
  oldest: { symbol: string; status: string; last_checked_at: string; bars: number; detail: string | null }[];
  newest: { symbol: string; asset_type: string; first_seen_at: string; request_count: number }[];
  /** Latest bar anywhere in the trend store - the refresh job's real high-water mark. */
  newestBar: string | null;
  barCount: number;
  symbolsWithBars: number;
}

export interface RateLimitUsage {
  /** Provider refusals and transport failures recorded in the directory. */
  rateLimited: { symbol: string; detail: string | null; last_checked_at: string }[];
  errored: { symbol: string; detail: string | null; last_checked_at: string }[];
  authAttempts24h: number;
  authFailures24h: number;
  aiEvents24h: number;
  chatEvents24h: number;
}

export interface EngineHealth {
  analyses: number;
  validated: number;
  /** Analyses with at least one historical analog attached, and the mean count. */
  withAnalogs: number;
  meanAnalogs: number | null;
  meanSimilarity: number | null;
  confidenceDistribution: { confidence_level: string; count: number }[];
  /** Scope-guard rejections - the gate that keeps output off a user's position. */
  scopeGuardFlagged: number;
  scopeGuardTotal: number;
  /** Analyses per week, most recent first. */
  weekly: { week: string; count: number }[];
}

export interface AdminSnapshot {
  ingestion: IngestionHealth;
  rateLimits: RateLimitUsage;
  engine: EngineHealth;
  providers: { name: string; provider_type: string; enabled: boolean; priority: number; endpoint: string }[];
}

/** True when the signed-in user carries the admin role. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role === "admin";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAdminSnapshot(): Promise<AdminSnapshot | null> {
  // Re-checked here rather than trusted from the page: the route guard and the
  // data loader each have to hold on their own, or one refactor moves the gate.
  if (!(await isCurrentUserAdmin())) return null;

  const admin = createAdminClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const staleBefore = new Date(Date.now() - DAY_MS).toISOString();

  const [
    { data: directory },
    { data: bars },
    { data: providers },
    { data: authRows },
    { count: aiEvents },
    { count: chatEvents },
    { data: analyses },
    { data: analogs },
    { data: guard },
  ] = await Promise.all([
    admin
      .from("symbol_directory")
      .select("symbol, asset_type, status, bars, detail, first_seen_at, last_checked_at, request_count"),
    admin.from("historical_prices").select("symbol, ts").order("ts", { ascending: false }).limit(1),
    admin.from("data_providers").select("name, provider_type, enabled, priority, endpoint").order("priority"),
    admin.from("auth_attempts").select("succeeded").gte("attempted_at", since),
    admin.from("ai_usage_events").select("*", { count: "exact", head: true }).gte("created_at", since),
    admin.from("chat_usage_events").select("*", { count: "exact", head: true }).gte("created_at", since),
    admin.from("ai_analyses").select("id, status, confidence_level, created_at"),
    admin.from("ai_analysis_historical_analogs").select("analysis_id, similarity_score"),
    admin.from("ai_scope_guard_log").select("flagged, is_test"),
  ]);

  const rows = directory ?? [];
  const byStatus = new Map<string, number>();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

  const analogRows = analogs ?? [];
  const analogsByAnalysis = new Map<string, number[]>();
  for (const a of analogRows) {
    const arr = analogsByAnalysis.get(a.analysis_id) ?? [];
    arr.push(Number(a.similarity_score));
    analogsByAnalysis.set(a.analysis_id, arr);
  }
  const analysisRows = analyses ?? [];
  const confidence = new Map<string, number>();
  for (const a of analysisRows) confidence.set(a.confidence_level, (confidence.get(a.confidence_level) ?? 0) + 1);

  const weekly = new Map<string, number>();
  for (const a of analysisRows) {
    const d = new Date(a.created_at);
    // ISO week start (Monday), so buckets line up week to week.
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    const key = d.toISOString().slice(0, 10);
    weekly.set(key, (weekly.get(key) ?? 0) + 1);
  }

  const allSimilarities = analogRows.map((a) => Number(a.similarity_score)).filter((n) => Number.isFinite(n));
  // Scope-guard test rows come from the adversarial suite, not from real
  // traffic; counting them as production rejections would overstate the rate.
  const guardRows = (guard ?? []).filter((g) => !g.is_test);

  const authRowsSafe = authRows ?? [];

  return {
    ingestion: {
      total: rows.length,
      byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
      staleCount: rows.filter((r) => r.status === "available" && r.last_checked_at < staleBefore).length,
      oldest: rows
        .filter((r) => r.status === "available")
        .sort((a, b) => (a.last_checked_at < b.last_checked_at ? -1 : 1))
        .slice(0, 8)
        .map((r) => ({ symbol: r.symbol, status: r.status, last_checked_at: r.last_checked_at, bars: r.bars, detail: r.detail })),
      newest: rows
        .slice()
        .sort((a, b) => (a.first_seen_at > b.first_seen_at ? -1 : 1))
        .slice(0, 8)
        .map((r) => ({ symbol: r.symbol, asset_type: r.asset_type, first_seen_at: r.first_seen_at, request_count: r.request_count })),
      newestBar: bars?.[0]?.ts ?? null,
      barCount: rows.reduce((sum, r) => sum + (r.bars ?? 0), 0),
      symbolsWithBars: rows.filter((r) => (r.bars ?? 0) > 0).length,
    },
    rateLimits: {
      rateLimited: rows
        .filter((r) => r.status === "rate_limited")
        .map((r) => ({ symbol: r.symbol, detail: r.detail, last_checked_at: r.last_checked_at })),
      errored: rows
        .filter((r) => r.status === "error")
        .map((r) => ({ symbol: r.symbol, detail: r.detail, last_checked_at: r.last_checked_at })),
      authAttempts24h: authRowsSafe.length,
      authFailures24h: authRowsSafe.filter((a) => !a.succeeded).length,
      aiEvents24h: aiEvents ?? 0,
      chatEvents24h: chatEvents ?? 0,
    },
    engine: {
      analyses: analysisRows.length,
      validated: analysisRows.filter((a) => a.status === "validated").length,
      withAnalogs: analogsByAnalysis.size,
      meanAnalogs:
        analysisRows.length === 0 ? null : analogRows.length / analysisRows.length,
      meanSimilarity:
        allSimilarities.length === 0 ? null : allSimilarities.reduce((a, b) => a + b, 0) / allSimilarities.length,
      confidenceDistribution: [...confidence.entries()]
        .map(([confidence_level, count]) => ({ confidence_level, count }))
        .sort((a, b) => b.count - a.count),
      scopeGuardFlagged: guardRows.filter((g) => g.flagged).length,
      scopeGuardTotal: guardRows.length,
      weekly: [...weekly.entries()]
        .map(([week, count]) => ({ week, count }))
        .sort((a, b) => (a.week > b.week ? -1 : 1))
        .slice(0, 8),
    },
    providers: providers ?? [],
  };
}
