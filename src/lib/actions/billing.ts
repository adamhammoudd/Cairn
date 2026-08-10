"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeUsageSummary, startOfCurrentMonthIso, type UsageSummary } from "@/lib/billing";
import type { SubscriptionTier } from "@/lib/supabase/types";

export async function getTier(): Promise<SubscriptionTier> {
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
