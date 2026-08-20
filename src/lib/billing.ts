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
}

export function computeUsageSummary(tier: SubscriptionTier, used: number): UsageSummary {
  const limit = TIER_LIMITS[tier].monthlyAiAnalyses;
  return {
    tier,
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    periodLabel: new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }),
  };
}

export interface ChatUsageSummary {
  tier: SubscriptionTier;
  limit: number | null;
  used: number;
  remaining: number | null;
}

export function computeChatUsageSummary(tier: SubscriptionTier, used: number): ChatUsageSummary {
  const limit = TIER_LIMITS[tier].dailyChatMessages;
  return { tier, limit, used, remaining: limit === null ? null : Math.max(limit - used, 0) };
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
