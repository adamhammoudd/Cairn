"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AlertChannelName,
  AssetFilter,
  BriefingDelivery,
  ChartView,
  Database,
  MetricStyle,
} from "@/lib/supabase/types";
import { isSupportedCurrency } from "@/lib/market-data/fx";
import { SECTOR_SLUGS } from "@/lib/sectors";
import { passwordChangeError, deleteConfirmationError } from "@/lib/settings-guards";

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

  // Only currencies lib/market-data/fx.ts can actually source a rate for are
  // accepted. A hand-posted "XYZ" would otherwise be stored and then silently
  // fall back to USD on every page, with Settings still showing XYZ.
  const submittedCurrency = String(formData.get("currency") ?? "USD");
  const currency = isSupportedCurrency(submittedCurrency) ? submittedCurrency : "USD";

  // Empty string is the "All sectors" option; anything else is stored as-is
  // because the map groups by SEC sector names, which are free text. An
  // unrecognised value simply matches no card and the page falls back to its
  // own ordering (see app/(app)/sector-map/page.tsx).
  const sectorFocus = String(formData.get("sector_map_default_sector") ?? "").trim();

  const briefingHour = Number(formData.get("briefing_hour_local") ?? 12);
  const briefingTimezone = String(formData.get("briefing_timezone") ?? "UTC").trim() || "UTC";
  const briefingWatchlistIds = (formData.getAll("briefing_watchlist_ids") as string[]).filter(Boolean);
  // Constrained to the shared sector vocabulary so a stored preference always
  // matches something the news tagger can emit.
  const briefingNewsCategories = (formData.getAll("briefing_news_categories") as string[]).filter((c) =>
    SECTOR_SLUGS.includes(c),
  );
  const submittedDelivery = String(formData.get("briefing_delivery") ?? "in_app");
  const briefingDelivery: BriefingDelivery =
    submittedDelivery === "email" || submittedDelivery === "push" ? submittedDelivery : "in_app";

  const { error } = await supabase
    .from("user_settings")
    .update({
      default_chart_view: formData.get("default_chart_view") as ChartView,
      refresh_rate_seconds: Number(formData.get("refresh_rate_seconds")),
      currency,
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
      sector_map_default_sector: sectorFocus || null,
      briefing_hour_local: Number.isInteger(briefingHour) && briefingHour >= 0 && briefingHour <= 23 ? briefingHour : 12,
      briefing_timezone: briefingTimezone,
      briefing_include_holdings: formData.get("briefing_include_holdings") === "on",
      briefing_watchlist_ids: briefingWatchlistIds,
      briefing_news_categories: briefingNewsCategories,
      briefing_delivery: briefingDelivery,
    })
    .eq("user_id", user.id);

  if (error) return error.message;

  // These preferences change how other pages render on first paint, so their
  // cached RSC payloads have to go too -- not just /settings. The layout entry
  // is what carries currency/density/metric-style to every page at once, since
  // those are resolved in app/(app)/layout.tsx rather than per page.
  revalidatePath("/", "layout");
  for (const path of ["/settings", "/alerts", "/markets", "/comparison", "/assistant", "/sector-map", "/portfolio"]) {
    revalidatePath(path);
  }
  return "saved";
}

/**
 * Display name and email.
 *
 * Two different mechanisms, deliberately reported separately: the name is a
 * plain row update and takes effect immediately, while Supabase treats an
 * email change as a verification flow - the address does not move until the
 * confirmation link is followed. Saying "saved" for both would tell someone
 * their email had changed when it had not.
 */
export async function updateProfile(_prevState: string | null, formData: FormData): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (displayName.length > 80) return "Name must be 80 characters or fewer.";
  if (!email) return "Email can't be empty.";

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null })
    .eq("user_id", user.id);
  if (profileError) return profileError.message;

  let emailPending = false;
  if (email !== user.email) {
    const { error: emailError } = await supabase.auth.updateUser({ email });
    if (emailError) return emailError.message;
    emailPending = true;
  }

  // The name is rendered by the app layout (top nav) as well as this page.
  revalidatePath("/", "layout");
  revalidatePath("/settings");

  return emailPending ? "email_pending" : "saved";
}

export async function changePassword(_prevState: string | null, formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");

  const guardError = passwordChangeError(currentPassword, password);
  if (guardError) return guardError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  // Re-authenticate with the current password before changing it. An active
  // session on its own - a stolen cookie, an unattended logged-in device, an
  // XSS bug - must not be enough to set a new password and lock the owner out
  // of their own account. signInWithPassword is the only "verify this
  // password" primitive the SDK exposes; on success it simply rotates this
  // same user's tokens.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) return "Current password is incorrect.";

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
//
// Second pass: the export covered everything the USER entered but none of what
// the system recorded ABOUT them - consent history, the AI and chat usage
// meters, and the tier-change ledger. Art. 15 is "all personal data concerning
// the data subject", not "everything they typed", so those four are exported
// too. auth_attempts stays out on purpose, for the reason given on /privacy:
// hashed identifiers, no account id, 24-hour retention, so no row there can be
// attributed to a specific person in the first place.
export async function exportUserData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Four of the tables below are written by the service-role client (usage
  // meters, consent records, tier-change history) and carry read policies that
  // vary - subscription_events has none at all. Under the user-scoped client an
  // RLS-denied select returns an empty array rather than an error, so those
  // sections would silently export as [] and the policy's "here is everything
  // we hold" claim would quietly be false. They are read through the admin
  // client instead, each one filtered on this authenticated user's own id.
  const admin = createAdminClient();

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
    { data: consents },
    { data: aiUsage },
    { data: chatUsage },
    { data: subscriptionEvents },
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
    admin.from("user_consents").select("*").eq("user_id", user.id).order("consented_at", { ascending: false }),
    admin.from("ai_usage_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("chat_usage_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("subscription_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
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
    // Art. 15 covers everything held about the person, not just what they
    // typed in. These four were held and not exported: what they agreed to and
    // when, what their usage was metered at, and every tier change on the
    // account.
    consents: consents ?? [],
    ai_usage_events: aiUsage ?? [],
    chat_usage_events: chatUsage ?? [],
    subscription_events: subscriptionEvents ?? [],
  };
}

// Two stores hold user-adjacent data that a straight `auth.admin.deleteUser`
// cascade does NOT reach, and there is no clean per-user delete for either:
//
//  1. ai_scope_guard_log - retains raw_output/corrected_output, which can echo
//     text a user typed into chat, and has no user_id column to filter on.
//     Handled by a 90-day time-based retention purge instead (migration
//     0035_scope_guard_log_retention.sql, cron `purge-scope-guard-log`), so no
//     row of that text outlives the window regardless of which user it came
//     from. Adding a user_id purely to enable a scrub here would make the log
//     MORE identifying, not less.
//
//  2. Groq (and any configured fallback) - the model provider that chat text
//     was sent to for inference. Checked against Groq's published terms
//     (2026-08-30): there is no per-account or per-record deletion API to call.
//     Groq does not retain inference inputs/outputs by default; short-lived
//     troubleshooting logs age out within 30 days; and an organisation admin
//     can turn on Zero Data Retention self-serve in the Groq console. The real
//     control is therefore the founder enabling ZDR at the org level (tracked
//     as a founder action item), not anything this function can do at request
//     time. Documented here and in docs/legal/privacy-policy.md rather than
//     left as an unstated gap.
export async function deleteAccount(confirmation?: string): Promise<string | void> {
  // The "type DELETE to confirm" friction is enforced here, not only in the
  // client component - deleteAccount is a server action and therefore a plain
  // callable endpoint, so the client-side gate is a convenience, not a control.
  const confirmError = deleteConfirmationError(confirmation);
  if (confirmError) return confirmError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return error.message;

  // Best-effort record that a deletion happened, for the founder's own audit of
  // whether upstream ZDR is in place. No PII in the log line.
  console.info(
    `[deleteAccount] account deleted. Supabase data cascaded. ` +
      `ai_scope_guard_log: covered by 90-day retention purge. ` +
      `Groq: no per-record deletion API - relies on org-level Zero Data Retention.`,
  );

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
