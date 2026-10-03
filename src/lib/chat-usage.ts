import "server-only";

// The chat quota: checked before the model is called, recorded after an answer
// was shown. Deliberately NOT in lib/actions/billing.ts: every export of a
// "use server" module is a server action a browser can call directly, and these
// used to take a `userId` argument - so any signed-in user could read another
// account's usage, or write usage rows against it until it was locked out
// (audit 2026-10-02, item 2.1). They now take no argument and read the user
// from the session, so there is no id to forge.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { getUserPlan, type UsageGate } from "@/lib/actions/billing";
import { isAdminUser } from "@/lib/admin-role";
import { BETA_CHAT_DAILY_CAP, betaPremiumUntil, computeChatUsageSummary, isValidTimeZone, resetPhrase, startOfTodayIso } from "@/lib/billing";

// Before-not-after discipline, same as reserveAiUsage (lib/ai-usage.ts). Daily
// rather than monthly (chat is a much higher-frequency surface than requesting a
// full analysis), and Premium's null limit means "never denied."
export async function checkChatUsageAllowed(): Promise<UsageGate> {
  const user = await getAuthUser();
  if (!user) return { allowed: false, message: "Sign in to use the assistant." };

  const supabase = await createClient();
  // "Today" is the day in the reader's own time zone (audit 4.2), UTC if unknown.
  const { data: settings } = await supabase.from("user_settings").select("briefing_timezone").eq("user_id", user.id).maybeSingle();
  const timeZone = isValidTimeZone(settings?.briefing_timezone) ? settings.briefing_timezone : "UTC";
  const [tier, { count }, admin] = await Promise.all([
    getUserPlan(),
    supabase
      .from("chat_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfTodayIso(timeZone)),
    isAdminUser(supabase, user.id),
  ]);

  if (admin) return { allowed: true };

  // Beta: everyone is on Premium (unlimited chat), so this abuse ceiling is
  // the only thing between one account and the model bill.
  if (betaPremiumUntil() && (count ?? 0) >= BETA_CHAT_DAILY_CAP) {
    return {
      allowed: false,
      message: `You've sent ${BETA_CHAT_DAILY_CAP} messages today, the most the beta allows in one day. It resets at ${resetPhrase(timeZone)}.`,
    };
  }

  const summary = computeChatUsageSummary(tier, count ?? 0);
  if (summary.limit !== null && (summary.remaining ?? 0) <= 0) {
    return {
      allowed: false,
      message: `You've used all ${summary.limit} chat messages included in your ${summary.tier} plan today. Switch plans on the Billing page or try again after it resets at ${resetPhrase(timeZone)}.`,
    };
  }
  return { allowed: true };
}

// A response is recorded as usage whenever the user actually received one -
// including a scope-guard rewrite, since a model call was made and an answer
// was shown either way. Only a genuine failure upstream (no response at all)
// should skip this, matching reserveAiUsage's "never costs a slot on
// failure" philosophy adapted to chat's every-turn cadence.
export async function recordChatUsage(): Promise<void> {
  const user = await getAuthUser();
  if (!user) return;
  await createAdminClient().from("chat_usage_events").insert({ user_id: user.id });
}
