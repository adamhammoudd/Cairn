// Types and pure math for subscription tiers and AI usage gating. Kept out
// of lib/actions/billing.ts because a "use server" module may only export
// async functions.

import type { SubscriptionTier } from "@/lib/supabase/types";

export interface TierConfig {
  label: string;
  monthlyAiAnalyses: number;
  /** null = unlimited (Premium). */
  dailyChatMessages: number | null;
  /** Content depth for MethodologyCard - see components/analysis/methodology-card.tsx.
   * Never affects confidence_level/reasoning_text/low-confidence honesty, only
   * how much of the sources/analogs detail is shown. */
  analysisDepth: "top_line" | "full";
}

export const TIER_LIMITS: Record<SubscriptionTier, TierConfig> = {
  free: { label: "Free", monthlyAiAnalyses: 5, dailyChatMessages: 20, analysisDepth: "top_line" },
  premium: { label: "Premium", monthlyAiAnalyses: 100, dailyChatMessages: null, analysisDepth: "full" },
};

export interface UsageSummary {
  tier: SubscriptionTier;
  limit: number;
  used: number;
  remaining: number;
  periodLabel: string;
  /** True for admins - no analysis cap; the count is shown for reference only. */
  unlimited: boolean;
}

export function computeUsageSummary(tier: SubscriptionTier, used: number, unlimited = false): UsageSummary {
  const limit = TIER_LIMITS[tier].monthlyAiAnalyses;
  return {
    tier,
    limit,
    used,
    // MAX_SAFE_INTEGER rather than Infinity: this crosses the RSC boundary as a
    // prop, and JSON.stringify(Infinity) is null. Callers gate on `unlimited`,
    // not this number, but it must still survive serialisation.
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(limit - used, 0),
    periodLabel: new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    unlimited,
  };
}

export interface ChatUsageSummary {
  tier: SubscriptionTier;
  limit: number | null;
  used: number;
  remaining: number | null;
  /** True for admins, or for Premium's null daily limit. */
  unlimited: boolean;
}

export function computeChatUsageSummary(tier: SubscriptionTier, used: number, unlimited = false): ChatUsageSummary {
  const limit = unlimited ? null : TIER_LIMITS[tier].dailyChatMessages;
  return {
    tier,
    limit,
    used,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    unlimited: unlimited || limit === null,
  };
}

/** The usage table as reserveWithinLimit sees it - see reserveAiUsage in lib/actions/billing.ts. */
export interface UsageLedger {
  /** Record one use now; returns its id so it can be refunded. */
  insert(): Promise<string>;
  /** Uses in the current period, including any just inserted. */
  count(): Promise<number>;
  remove(id: string): Promise<void>;
}

export type Reservation = { allowed: true; reservationId: string } | { allowed: false; used: number };

/**
 * Take a slot, then check it. The previous order - count, generate for several
 * seconds, then record - let every request that arrived while one slot was
 * left pass the count, so five parallel requests on a Free account with one
 * analysis remaining produced five analyses. Inserting first and counting
 * after means the last request to land always sees every earlier one, so the
 * limit cannot be overrun; at worst two requests racing for the final slot are
 * both refused and one retries. A refused request removes its own row.
 */
export async function reserveWithinLimit(ledger: UsageLedger, limit: number): Promise<Reservation> {
  const reservationId = await ledger.insert();
  const used = await ledger.count();
  if (used > limit) {
    await ledger.remove(reservationId);
    return { allowed: false, used: used - 1 };
  }
  return { allowed: true, reservationId };
}

// Calendar-month boundary - usage resets naturally each month with no
// separate period-reset job needed, since it's just a WHERE created_at >=
// this filter on ai_usage_events.
export function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// Calendar-day boundary (server/local time), same reset-with-no-job pattern
// as startOfCurrentMonthIso, applied to chat_usage_events.
export function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}
