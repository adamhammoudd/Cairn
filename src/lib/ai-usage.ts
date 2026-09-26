import "server-only";

// The AI-analysis quota: reserve a slot before generating, refund it if the
// generation doesn't produce an analysis. Deliberately NOT in
// lib/actions/billing.ts: every export of a "use server" module is a server
// action a browser can call directly, and a callable "refund this
// reservation" is a free unlimited plan.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPlan } from "@/lib/actions/billing";
import { isAdminUser } from "@/lib/admin-role";
import { computeUsageSummary, reserveWithinLimit, startOfCurrentMonthIso, TIER_LIMITS } from "@/lib/billing";

export type AiUsageReservation =
  | { allowed: true; reservationId: string }
  | { allowed: false; message: string };

/**
 * Checked by runAnalysisGeneration before calling the AI. `userId` must be the
 * signed-in user: the plan comes from getUserPlan(), the one shared gate
 * (CLAUDE.md), which reads the session.
 */
export async function reserveAiUsage(userId: string): Promise<AiUsageReservation> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const [tier, isAdmin] = await Promise.all([getUserPlan(), isAdminUser(supabase, userId)]);

  const ledger = {
    insert: async () => {
      // Service role: a usage log the user must not be able to write or delete.
      const { data, error } = await admin.from("ai_usage_events").insert({ user_id: userId }).select("id").single();
      if (error || !data) throw new Error(`ai_usage_events insert failed: ${error?.message ?? "no row"}`);
      return data.id;
    },
    count: async () => {
      const { count, error } = await admin
        .from("ai_usage_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfCurrentMonthIso());
      if (error) throw new Error(`ai_usage_events count failed: ${error.message}`);
      return count ?? 0;
    },
    remove: async (id: string) => {
      await admin.from("ai_usage_events").delete().eq("id", id);
    },
  };

  // Admins have no cap but still record usage, so their own figures stay real.
  if (isAdmin) return { allowed: true, reservationId: await ledger.insert() };

  const result = await reserveWithinLimit(ledger, TIER_LIMITS[tier].monthlyAiAnalyses);
  if (result.allowed) return result;
  const summary = computeUsageSummary(tier, result.used);
  return {
    allowed: false,
    message: `You've used all ${summary.limit} AI analyses included in your ${summary.tier} plan this month. Switch plans on the Billing page or wait until next month.`,
  };
}

/** Give the slot back - the generation failed, so it must not cost the user one. */
export async function releaseAiUsage(reservationId: string): Promise<void> {
  const { error } = await createAdminClient().from("ai_usage_events").delete().eq("id", reservationId);
  if (error) console.error("[billing] could not refund an AI usage reservation", { reservationId, error: error.message });
}
