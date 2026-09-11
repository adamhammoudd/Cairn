"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, stripeConfigured, PREMIUM_PRICE_ID, siteUrl, customerIdempotencyKey } from "@/lib/stripe";

// Phase 12. These start Stripe-hosted flows only. The webhook
// (app/api/stripe/webhook) is what actually writes a premium tier - so a user
// who abandons checkout, or forges the return redirect, gets nothing.

function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true" && stripeConfigured();
}

/**
 * The Stripe Customer for this user, created and recorded on first use.
 *
 * A double-click or two open tabs both fire this within seconds of each other.
 * Without a guard, each call sees `stripe_customer_id` still null and calls
 * `stripe.customers.create()` - two Customer records for one user, the second
 * silently orphaning the first. The per-user idempotency key fixes that:
 * Stripe caches the create response for 24h and returns the SAME customer for
 * every call carrying the key, so the two racing requests converge on one
 * record and the (identical) row write that follows is a harmless no-op.
 */
async function ensureStripeCustomer(userId: string, email: string | undefined): Promise<string> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (row?.stripe_customer_id) return row.stripe_customer_id;

  const customer = await stripe.customers.create(
    { email, metadata: { cairn_user_id: userId } },
    { idempotencyKey: customerIdempotencyKey(userId) },
  );
  await admin
    .from("subscriptions")
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id" });
  return customer.id;
}

/**
 * Start a Checkout Session for the Premium plan and redirect the browser to
 * Stripe. Returns an error string only when it cannot get that far.
 */
export async function createCheckoutSession(): Promise<string | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!billingEnabled()) {
    return "Premium isn't available yet - payments aren't set up. Nothing has been charged.";
  }

  // Refuse to start a second subscription. Nothing here read the current tier
  // before, and a server action is directly invocable - so a stale tab, a
  // double submit, or a hand-rolled POST billed the same person twice. Stripe
  // permits multiple subscriptions per customer, and the sync reads
  // `subscriptions.list({ limit: 1 })`, so the second charge would not even be
  // visible in the app.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("tier, stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.stripe_subscription_id && existing.status !== "canceled") {
    return "You already have an active subscription. Manage it from 'Manage billing'.";
  }

  const customerId = await ensureStripeCustomer(user.id, user.email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: PREMIUM_PRICE_ID, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${siteUrl()}/billing?checkout=success`,
    cancel_url: `${siteUrl()}/billing?checkout=cancelled`,
    subscription_data: { metadata: { cairn_user_id: user.id } },
    client_reference_id: user.id,

    // VAT. Stripe Tax is active on the account and the Premium price is
    // tax_behavior: "exclusive" - i.e. VAT is meant to be added on top - but
    // none of that engages unless the session asks for it, so every sale was
    // being made at a flat EUR 12 with no tax collected and no way to tell
    // which country the buyer was in.
    //
    // EU B2C digital services are taxed at the *buyer's* rate and require two
    // non-contradictory pieces of location evidence; the address collected
    // here is the first, and Stripe's own IP geolocation the second. Without
    // this block the VAT owed comes out of the EUR 12.
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    // Required whenever automatic tax runs against a pre-created Customer:
    // ensureStripeCustomer() creates it with an email and nothing else, so
    // without this the address collected at checkout is never written back and
    // tax cannot be computed on renewal invoices.
    customer_update: { address: "auto", name: "auto" },
    // B2B buyers in the EU reverse-charge. Without a VAT ID field every
    // business customer is charged consumer VAT instead.
    tax_id_collection: { enabled: true },
  });

  if (!session.url) return "Stripe did not return a checkout URL. Please try again.";
  redirect(session.url);
}

/**
 * Open the Stripe Customer Portal (change card, cancel, see invoices). The
 * user must already have a Stripe customer - the button is only shown when
 * they do.
 */
export async function createPortalSession(): Promise<string | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!stripeConfigured()) return "Billing portal is unavailable right now.";

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row?.stripe_customer_id) return "No billing account on file yet.";

  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${siteUrl()}/billing`,
  });
  redirect(session.url);
}
