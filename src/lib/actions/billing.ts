"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeUsageSummary,
  computeChatUsageSummary,
  startOfCurrentMonthIso,
  startOfTodayIso,
  type UsageSummary,
  type ChatUsageSummary,
} from "@/lib/billing";
import type { SubscriptionTier } from "@/lib/supabase/types";

// The one shared gate every premium/billing-gated feature routes through
// (CLAUDE.md: "Every premium/billing feature must route through the shared
// getUserPlan() gate"). Previously named getTier() with zero call sites —
// renamed so it's actually the thing every gate below calls.
export async function getUserPlan(): Promise<SubscriptionTier> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "free";

  const { data } = await supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle();
  return data?.tier ?? "free";
}

export async function getBillingSummary(): Promise<UsageSummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return computeUsageSummary("free", 0);

  const [{ data: subscription }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("ai_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfCurrentMonthIso()),
  ]);

  return computeUsageSummary(subscription?.tier ?? "free", count ?? 0);
}

export async function getChatUsageSummary(): Promise<ChatUsageSummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return computeChatUsageSummary("free", 0);

  const [{ data: subscription }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("chat_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfTodayIso()),
  ]);

  return computeChatUsageSummary(subscription?.tier ?? "free", count ?? 0);
}

// Self-serve, no payment — this build has no real billing processor yet
// (see migration 0012's header note). Explicitly disclosed as such in the
// Billing UI so it never reads as a real purchase flow.
export async function setTier(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tier = String(formData.get("tier") ?? "");
  if (tier !== "free" && tier !== "premium") return "Invalid plan.";

  const { error } = await supabase.from("subscriptions").upsert({ user_id: user.id, tier });
  if (error) return error.message;

  revalidatePath("/billing");
  revalidatePath("/");
  return "saved";
}

export interface UsageGate {
  allowed: boolean;
  message?: string;
}

// Checked by requestAnalysis before calling the AI — never after, so a
// failed/rejected generation never costs the user a slot. See recordAiUsage
// for the write side of this on success.
export async function checkAiUsageAllowed(userId: string): Promise<UsageGate> {
  const supabase = await createClient();

  const [{ data: subscription }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle(),
    supabase
      .from("ai_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfCurrentMonthIso()),
  ]);

  const summary = computeUsageSummary(subscription?.tier ?? "free", count ?? 0);
  if (summary.remaining <= 0) {
    return {
      allowed: false,
      message: `You've used all ${summary.limit} AI analyses included in your ${summary.tier} plan this month. Switch plans on the Billing page or wait until next month.`,
    };
  }
  return { allowed: true };
}

// Runs through the service-role client because it's a system-recorded usage
// log the calling user shouldn't be able to write or delete themselves —
// same admin-client-for-derived-data pattern as discussion vote counters.
export async function recordAiUsage(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("ai_usage_events").insert({ user_id: userId });
}

// Checked by app/api/chat/route.ts before calling the model — same
// before-not-after discipline as checkAiUsageAllowed above. Daily rather
// than monthly (chat is a much higher-frequency surface than requesting a
// full analysis), and Premium's null limit means "never denied."
export async function checkChatUsageAllowed(userId: string): Promise<UsageGate> {
  const supabase = await createClient();

  const [{ data: subscription }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle(),
    supabase
      .from("chat_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfTodayIso()),
  ]);

  const summary = computeChatUsageSummary(subscription?.tier ?? "free", count ?? 0);
  if (summary.limit !== null && (summary.remaining ?? 0) <= 0) {
    return {
      allowed: false,
      message: `You've used all ${summary.limit} chat messages included in your ${summary.tier} plan today. Switch plans on the Billing page or try again tomorrow.`,
    };
  }
  return { allowed: true };
}

// A response is recorded as usage whenever the user actually received one —
// including a scope-guard rewrite, since a model call was made and an answer
// was shown either way. Only a genuine failure upstream (no response at all)
// should skip this, matching checkAiUsageAllowed's "never costs a slot on
// failure" philosophy adapted to chat's every-turn cadence.
export async function recordChatUsage(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("chat_usage_events").insert({ user_id: userId });
}
