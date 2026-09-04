import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionTier } from "@/lib/supabase/types";

// Phase 12 - Stripe billing.
//
// Design mirrors the rest of the billing code: the WEBHOOK (service-role, its
// signature verified) is the only thing that grants premium. Checkout and the
// Customer Portal just start Stripe-hosted flows; nothing the browser posts
// back sets a tier. getUserPlan() keeps reading subscriptions.tier, so every
// existing gate is downstream of the webhook with no change.
//
// Config (all server-only, see .env.local.example):
//   STRIPE_SECRET_KEY       sk_test_... then sk_live_...
//   STRIPE_WEBHOOK_SECRET   whsec_... from `stripe listen` / the dashboard endpoint
//   STRIPE_PRICE_PREMIUM    price_... the recurring Premium price
//   NEXT_PUBLIC_SITE_URL    absolute base for checkout return URLs

const SECRET = process.env.STRIPE_SECRET_KEY ?? "";

/** True when the secret key and the Premium price are both configured. */
export function stripeConfigured(): boolean {
  return SECRET.startsWith("sk_") && !!process.env.STRIPE_PRICE_PREMIUM;
}

// Pinned API version so a Stripe-side default bump can't change our types.
// A placeholder key keeps module load from throwing when Stripe is unconfigured
// (billing.ts imports this, so it's on the app's hot path); every code path
// that makes a real API call is already behind stripeConfigured() /
// billingEnabled(), and the webhook's constructEvent needs no valid key.
export const stripe = new Stripe(SECRET || "sk_unconfigured_placeholder", {
  apiVersion: "2026-08-26.dahlia",
});

export const PREMIUM_PRICE_ID = process.env.STRIPE_PRICE_PREMIUM ?? "";

/**
 * Deterministic idempotency key for creating this user's Stripe Customer.
 * Passed to `customers.create` so a double-click / two open tabs (both within
 * Stripe's 24h idempotency window) converge on ONE Customer record instead of
 * creating one each and orphaning the first.
 */
export function customerIdempotencyKey(userId: string): string {
  return `cairn-customer-${userId}`;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Map a Stripe subscription status to the Cairn tier. Only a subscription that
 * is actually paid up grants premium; `past_due` keeps premium through the
 * grace window Stripe itself allows, everything else is free.
 */
export function tierForStripeStatus(status: Stripe.Subscription.Status | string): SubscriptionTier {
  return status === "active" || status === "trialing" || status === "past_due" ? "premium" : "free";
}

interface SyncResult {
  userId: string;
  fromTier: SubscriptionTier;
  toTier: SubscriptionTier;
  status: string;
}

/**
 * Reconcile our `subscriptions` row for one Stripe customer against Stripe's
 * current state. Called from the webhook for every subscription-shaped event
 * (create / update / delete / invoice paid / invoice failed) so the handler
 * never has to trust the individual event payload - it always re-reads the
 * customer's real subscription list. Returns null when the customer maps to no
 * known user (e.g. a test object from another environment).
 */
export async function syncSubscriptionForCustomer(customerId: string): Promise<SyncResult | null> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("subscriptions")
    .select("user_id, tier")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  let userId = existing?.user_id ?? null;
  if (!userId) {
    // Fall back to the metadata we set at checkout, so the very first event
    // for a brand-new customer still lands on the right user.
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) userId = customer.metadata?.cairn_user_id ?? null;
  }
  if (!userId) return null;

  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
  const sub = subs.data[0] ?? null;

  const fromTier: SubscriptionTier = existing?.tier ?? "free";
  const toTier: SubscriptionTier = sub ? tierForStripeStatus(sub.status) : "free";
  const status = sub?.status ?? "canceled";
  // `current_period_end` moved to the subscription item in recent API
  // versions; read the item first and fall back to the top-level field.
  const periodEndUnix =
    (sub?.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number } | null)?.current_period_end ??
    null;

  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      tier: toTier,
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub?.id ?? null,
      current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (fromTier !== toTier) {
    await admin.from("subscription_events").insert({
      user_id: userId,
      from_tier: fromTier,
      to_tier: toTier,
      source: "stripe",
    });
  }

  return { userId, fromTier, toTier, status };
}
