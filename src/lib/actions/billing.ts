"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConfigured, stripeLiveMode } from "@/lib/stripe";
import {
  computeUsageSummary,
  computeChatUsageSummary,
  startOfCurrentMonthIso,
  startOfTodayIso,
  resetPhrase,
  isValidTimeZone,
  betaPremiumUntil,
  resolvePlan,
  formatBetaUntil,
  BETA_CHAT_DAILY_CAP,
  type UsageSummary,
  type ChatUsageSummary,
} from "@/lib/billing";
import type { SubscriptionTier } from "@/lib/supabase/types";
import { isAdminUser } from "@/lib/admin-role";

// The one shared gate every premium/billing-gated feature routes through
// (CLAUDE.md: "Every premium/billing feature must route through the shared
// getUserPlan() gate"). Previously named getTier() with zero call sites -
// renamed so it's actually the thing every gate below calls.
//
// BETA_PREMIUM_UNTIL (see lib/billing.ts resolvePlan) is applied here and only
// here, so every gate that already calls getUserPlan() picks it up.
export async function getUserPlan(): Promise<SubscriptionTier> {
  const user = await getAuthUser();
  if (!user) return "free";

  const beta = betaPremiumUntil();
  if (beta) return resolvePlan(null, true, beta);

  const supabase = await createClient();
  const { data } = await supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle();
  return resolvePlan(data?.tier, true, null);
}

/**
 * The beta end date as display text ("31 December 2026"), or null when beta
 * access is off. For the Billing note and the assistant sidebar.
 */
export async function getBetaAccessLabel(): Promise<string | null> {
  const beta = betaPremiumUntil();
  return beta ? formatBetaUntil(beta) : null;
}

export async function getBillingSummary(): Promise<UsageSummary> {
  const user = await getAuthUser();
  if (!user) return computeUsageSummary("free", 0);

  const supabase = await createClient();

  const [tier, { count }, admin] = await Promise.all([
    getUserPlan(),
    supabase
      .from("ai_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfCurrentMonthIso()),
    isAdminUser(supabase, user.id),
  ]);

  return computeUsageSummary(tier, count ?? 0, admin);
}

// The reader's time zone, for "today" in the daily chat cap. user_settings
// holds one (briefing_timezone); a missing row or an invalid zone is UTC.
async function readerTimeZone(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data } = await supabase.from("user_settings").select("briefing_timezone").eq("user_id", userId).maybeSingle();
  const tz = data?.briefing_timezone;
  return isValidTimeZone(tz) ? tz : "UTC";
}

export async function getChatUsageSummary(): Promise<ChatUsageSummary> {
  const user = await getAuthUser();
  if (!user) return computeChatUsageSummary("free", 0);

  const supabase = await createClient();
  const timeZone = await readerTimeZone(supabase, user.id);

  const [tier, { count }, admin] = await Promise.all([
    getUserPlan(),
    supabase
      .from("chat_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfTodayIso(timeZone)),
    isAdminUser(supabase, user.id),
  ]);

  return computeChatUsageSummary(tier, count ?? 0, admin);
}

// There is no billing processor in this build. Until there is, upgrading is
// refused HERE, on the server, rather than by hiding the button: a form POST
// straight to this action was a free, unlimited upgrade to premium for any
// signed-in user, and hiding the control in the UI would leave that intact
// for anyone who opened devtools once.
//
// Flag rather than a hard-coded false so that wiring Stripe is a config
// change plus a webhook, not a hunt for the place upgrades were disabled.
// Absent env var means disabled -- the safe direction. Also requires Stripe
// to actually be configured, so the UI can't offer a checkout that 500s.
function billingEnabled(): boolean {
  if (process.env.BILLING_ENABLED !== "true" || !stripeConfigured()) return false;
  // Never sell from a production runtime holding test-mode keys: the button
  // would be real, the card form would be real, and the money would not be.
  // Outside production a test key is the correct thing to be holding.
  if (process.env.NODE_ENV === "production" && !stripeLiveMode()) return false;
  return true;
}

// Plan changes the user can make WITHOUT paying: only downgrade to free, and
// (before Stripe is wired) the "not available yet" message. Premium is granted
// exclusively by the Stripe webhook (app/api/stripe/webhook) - this action
// must never write tier='premium', or a raw form POST is a free subscription
// whether billing is on or off.
export async function setTier(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tier = String(formData.get("tier") ?? "");
  if (tier !== "free" && tier !== "premium") return "Invalid plan.";

  if (tier === "premium") {
    // Never self-serve. With Stripe configured, upgrading goes through
    // createCheckoutSession(); without it, there is nothing to sell.
    return billingEnabled()
      ? "Start a Premium subscription from the checkout button, not here."
      : "Premium isn't available yet - payments aren't set up. Nothing has been charged or changed.";
  }

  // Downgrade to free. Always allowed - a user must be able to leave a plan.
  // If they have a live Stripe subscription, send them to the Customer Portal
  // to actually cancel; flipping the row here without cancelling in Stripe
  // would keep charging them.
  const { data: current } = await supabase
    .from("subscriptions")
    .select("tier, stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const fromTier: SubscriptionTier = current?.tier ?? "free";

  if (current?.stripe_subscription_id && current.status !== "canceled") {
    return "You have an active subscription - cancel it from 'Manage billing' so you're not charged again. The plan changes here once Stripe confirms.";
  }

  // Through the service-role client. Migration 0042 revoked write access to
  // `subscriptions` from `authenticated`, because a row-level write grant on a
  // table whose `tier` column decides entitlement is a self-serve upgrade: the
  // anon key is in the browser bundle, so `update({ tier: 'premium' })` was one
  // console paste away. This downgrade is the only write the app ever made as
  // the user, and it is safe to run privileged - `tier` is pinned to "free"
  // above, and the branch is unreachable for any other value.
  const { error } = await createAdminClient().from("subscriptions").upsert({ user_id: user.id, tier });
  if (error) return error.message;

  if (fromTier !== tier) {
    // Through the service-role client: this is the user's billing record, and
    // a user must not be able to forge or delete their own. Same posture as
    // the AI usage log. A failure here must not fail the plan change itself - the
    // tier is already committed and the history line is secondary - so it is
    // logged rather than returned.
    const admin = createAdminClient();
    const { error: eventError } = await admin.from("subscription_events").insert({
      user_id: user.id,
      from_tier: fromTier,
      to_tier: tier,
      source: "self_serve",
    });
    if (eventError) console.error("subscription_events insert failed", eventError.message);
  }

  revalidatePath("/billing");
  revalidatePath("/settings");
  revalidatePath("/");
  return "saved";
}

export interface PlanChange {
  id: string;
  fromTier: SubscriptionTier | null;
  toTier: SubscriptionTier;
  source: string;
  amountCents: number | null;
  currency: string | null;
  createdAt: string;
}

export interface BillingDetail {
  usage: UsageSummary;
  chat: ChatUsageSummary;
  /** Null until a payment processor sets one - never fabricated. */
  renewsAt: string | null;
  /** Plan changes, newest first. Not payments - see migration 0031. */
  history: PlanChange[];
  /** Mirrors the server-side gate, so the UI can explain a refused upgrade. */
  billingEnabled: boolean;
  /** True once this user has a Stripe customer - gates the "Manage billing" link. */
  hasStripeCustomer: boolean;
  /** "31 December 2026" while BETA_PREMIUM_UNTIL grants Premium, else null. */
  betaUntil: string | null;
}

/**
 * Everything Settings > Billing shows, from the same functions the Billing
 * page and the Research page's quota indicator read.
 *
 * getBillingSummary() and getChatUsageSummary() are reused rather than
 * re-counted here, which is what keeps the Settings usage figures and the
 * Research page's quota indicator from drifting apart - they are literally the
 * same count.
 */
export async function getBillingDetail(): Promise<BillingDetail> {
  const user = await getAuthUser();
  const supabase = await createClient();
  const timeZone = user ? await readerTimeZone(supabase, user.id) : "UTC";

  if (!user) {
    return {
      usage: computeUsageSummary("free", 0),
      chat: computeChatUsageSummary("free", 0),
      renewsAt: null,
      history: [],
      billingEnabled: billingEnabled(),
      hasStripeCustomer: false,
      betaUntil: null,
    };
  }

  // One auth check, one Promise.all. This used to call getBillingSummary() +
  // getChatUsageSummary(), each of which re-ran auth.getUser() and re-queried
  // subscriptions - so a Settings load fired ~3 auth validations and ~4
  // subscriptions reads for figures that come from one row. computeUsageSummary
  // / computeChatUsageSummary are the same pure functions those helpers use.
  const [{ data: subscription }, { count: aiCount }, { count: chatCount }, admin, { data: events }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("tier, current_period_end, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("ai_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfCurrentMonthIso()),
    supabase
      .from("chat_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfTodayIso(timeZone)),
    isAdminUser(supabase, user.id),
    supabase
      .from("subscription_events")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Same rule as getUserPlan(), applied to the row already fetched above.
  const beta = betaPremiumUntil();
  const tier = resolvePlan(subscription?.tier, true, beta);

  return {
    usage: computeUsageSummary(tier, aiCount ?? 0, admin),
    chat: computeChatUsageSummary(tier, chatCount ?? 0, admin),
    renewsAt: subscription?.current_period_end ?? null,
    hasStripeCustomer: !!subscription?.stripe_customer_id,
    history: (events ?? []).map((e) => ({
      id: e.id,
      fromTier: e.from_tier,
      toTier: e.to_tier,
      source: e.source,
      amountCents: e.amount_cents,
      currency: e.currency,
      createdAt: e.created_at,
    })),
    billingEnabled: billingEnabled(),
    betaUntil: beta ? formatBetaUntil(beta) : null,
  };
}

export interface UsageGate {
  allowed: boolean;
  message?: string;
}

// The AI-analysis quota (reserve before generating, refund on failure) lives in
// lib/ai-usage.ts - not here, where every export is a callable server action.

// Checked by app/api/chat/route.ts before calling the model - same
// before-not-after discipline as reserveAiUsage (lib/ai-usage.ts). Daily rather
// than monthly (chat is a much higher-frequency surface than requesting a
// full analysis), and Premium's null limit means "never denied."
export async function checkChatUsageAllowed(userId: string): Promise<UsageGate> {
  const supabase = await createClient();
  const timeZone = await readerTimeZone(supabase, userId);

  const [tier, { count }, admin] = await Promise.all([
    getUserPlan(),
    supabase
      .from("chat_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfTodayIso(timeZone)),
    isAdminUser(supabase, userId),
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
export async function recordChatUsage(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("chat_usage_events").insert({ user_id: userId });
}
