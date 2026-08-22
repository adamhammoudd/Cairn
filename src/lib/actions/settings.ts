"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AlertChannelName, AssetFilter, ChartView, Database, MetricStyle } from "@/lib/supabase/types";

type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];

// Single read point for the preferences other pages need at render time
// (Markets default filter, Alerts default channels, Comparison default
// timeframe, assistant behaviour). Returns null when unauthenticated so
// callers can fall back to hard defaults rather than throwing.
export async function getUserSettings(): Promise<UserSettings | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).single();
  return data ?? null;
}

export async function updateSettings(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const priceMoveThreshold = Number(formData.get("price_move_threshold") ?? 5);
  const alertChannels = (formData.getAll("default_alert_channels") as string[]).filter(
    Boolean,
  ) as AlertChannelName[];

  const { error } = await supabase
    .from("user_settings")
    .update({
      default_chart_view: formData.get("default_chart_view") as ChartView,
      refresh_rate_seconds: Number(formData.get("refresh_rate_seconds")),
      currency: String(formData.get("currency")),
      metric_style: formData.get("metric_style") as MetricStyle,
      compact_mode: formData.get("compact_mode") === "on",
      extended_hours: formData.get("extended_hours") === "on",
      notification_thresholds: { price_move_percent: priceMoveThreshold },
      default_asset_filter: (formData.get("default_asset_filter") as AssetFilter) || "all",
      // An all-unchecked channel group submits nothing at all; falling back to
      // in-app keeps a new alert deliverable rather than silently undeliverable.
      default_alert_channels:
        alertChannels.length > 0 ? alertChannels : (["in_app"] as AlertChannelName[]),
      default_comparison_timeframe: (formData.get("default_comparison_timeframe") as ChartView) || "3M",
      assistant_expand_methodology: formData.get("assistant_expand_methodology") === "on",
      assistant_use_portfolio_context: formData.get("assistant_use_portfolio_context") === "on",
    })
    .eq("user_id", user.id);

  if (error) return error.message;

  // These preferences change how other pages render on first paint, so their
  // cached RSC payloads have to go too -- not just /settings.
  for (const path of ["/settings", "/alerts", "/markets", "/comparison", "/assistant"]) {
    revalidatePath(path);
  }
  return "saved";
}

export async function changePassword(_prevState: string | null, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return "Password must be at least 8 characters.";

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return error.message;
  return "saved";
}

// GDPR Art. 20 portability / CCPA right to know.
//
// This returned only { account, profile, settings } - none of the holdings,
// watchlists, chat history, alerts or briefings that the privacy policy says
// Cairn collects. An export that omits most of the personal data held is not a
// data export, and the policy's claim did not match the feature.
//
// Deletion is the other half and is genuinely correct: deleteAccount() removes
// the auth user and every user_id column cascades, verified in
// supabase/tests/gdpr_erasure.sql.
export async function exportUserData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: settings },
    { data: holdings },
    { data: watchlists },
    { data: watchlistItems },
    { data: chatSessions },
    { data: chatMessages },
    { data: alerts },
    { data: alertDeliveries },
    { data: savedScreens },
    { data: briefings },
    { data: goals },
    { data: subscription },
    { data: discussion },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("holdings").select("*").eq("user_id", user.id),
    supabase.from("watchlists").select("*").eq("user_id", user.id),
    // Child tables are reachable through RLS, which scopes them to this
    // user's parents - the same join the IDOR suite exercises.
    supabase.from("watchlist_items").select("*"),
    supabase.from("chat_sessions").select("*").eq("user_id", user.id),
    supabase.from("chat_messages").select("*"),
    supabase.from("alerts").select("*").eq("user_id", user.id),
    supabase.from("alert_deliveries").select("*"),
    supabase.from("saved_screens").select("*").eq("user_id", user.id),
    supabase.from("daily_briefings").select("*").eq("user_id", user.id),
    supabase.from("goals").select("*").eq("user_id", user.id),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("discussion_threads").select("*").eq("user_id", user.id),
  ]);

  return {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
    profile,
    settings,
    holdings: holdings ?? [],
    watchlists: watchlists ?? [],
    watchlist_items: watchlistItems ?? [],
    chat_sessions: chatSessions ?? [],
    chat_messages: chatMessages ?? [],
    alerts: alerts ?? [],
    alert_deliveries: alertDeliveries ?? [],
    saved_screens: savedScreens ?? [],
    daily_briefings: briefings ?? [],
    goals: goals ?? [],
    subscription,
    discussion_posts: discussion ?? [],
  };
}

export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return error.message;

  await supabase.auth.signOut();
  redirect("/login");
}


/**
 * Record whether the user wants to be told when two-factor authentication
 * ships. It is a mailing-list flag, not a security control - see
 * components/settings/two-factor-panel.tsx for why the placeholder holds real
 * state instead of a switch that does nothing.
 */
export async function setTwoFactorInterest(_prevState: string | null, formData: FormData): Promise<string | null> {
  const next = String(formData.get("two_factor_status") ?? "");
  if (next !== "requested" && next !== "not_enrolled") return "Unknown value.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("user_settings").update({ two_factor_status: next }).eq("user_id", user.id);
  if (error) return error.message;

  revalidatePath("/settings");
  return next;
}
