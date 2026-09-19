"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, stripeConfigured, stripeLiveMode, PREMIUM_PRICE_ID, siteUrl, customerIdempotencyKey } from "@/lib/stripe";

// Phase 12. These start Stripe-hosted flows only. The webhook
// (app/api/stripe/webhook) is what actually writes a premium tier - so a user
// who abandons checkout, or forges the return redirect, gets nothing.

/**
 * This used to be `BILLING_ENABLED === "true" && stripeConfigured()`, a second
 * copy of the check in lib/actions/billing.ts that had drifted from it. The
 * copy in billing.ts also refuses to sell in production on test-mode keys;
 * this one did not. Since checkout is the path that actually takes money, the
 * weaker of the two duplicates was guarding the only call that mattered: a
 * production deploy left on `sk_test_` would show a real Upgrade button and
 * grant genuine Premium to anyone paying with 4242 4242 4242 4242.
 *
 * Kept local rather than imported because billing.ts is a "use server" module
 * and may only export async functions - importing a sync predicate from it is
 * not possible. The live-mode condition is duplicated instead, with this
 * comment as the reason the two must stay in step.
 */
function billingEnabled(): boolean {
  if (process.env.BILLING_ENABLED !== "true" || !stripeConfigured()) return false;
  if (process.env.NODE_ENV === "production" && !stripeLiveMode()) return false;
  return true;
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

    // The 14-day withdrawal right, captured at the only moment it counts.
    //
    // Under the Consumer Rights Directive an EU consumer has 14 days to
    // withdraw from a distance contract. Article 16(m) removes that right for
    // digital services ONLY where the consumer gave prior express consent to
    // performance beginning immediately AND acknowledged losing the right. If
    // that is not collected, the withdrawal period never starts and stays open
    // for up to 12 months - on every subscription sold.
    //
    // Terms section 9 and the /refunds page both now state that this is asked
    // at checkout, so this block is what makes those statements true. Stripe
    // records the acceptance against the session, which is the evidence that
    // the consent was actually given.
    //
    // PREREQUISITE, OR THIS CALL 400s: Stripe requires a Terms of Service URL
    // on the account before `consent_collection[terms_of_service]` may be used.
    // Set it at Dashboard -> Settings -> Business -> Public details -> Terms of
    // service URL, pointing at <site>/terms. Without it, every checkout attempt
    // fails at session creation. It fails loudly rather than silently, but it
    // fails completely, so set it before testing checkout.
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message:
          "I agree to the Terms of Service and the Cancellation and Refunds policy. " +
          "I expressly request that my Premium access begin immediately, and I acknowledge " +
          "that I lose my 14-day right of withdrawal once the service has been fully performed.",
      },
    },
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
