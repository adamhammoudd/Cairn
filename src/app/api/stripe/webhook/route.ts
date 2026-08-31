import type Stripe from "stripe";
import { stripe, syncSubscriptionForCustomer } from "@/lib/stripe";

// Phase 12 - the only endpoint that grants or revokes premium.
//
// Every request is signature-verified against STRIPE_WEBHOOK_SECRET before
// anything is read from it; an unsigned or wrongly-signed body is a 400 and
// touches no data. For the events we care about we don't trust the payload's
// own fields either - we take the customer id from it and re-read that
// customer's real subscription list from Stripe (syncSubscriptionForCustomer).
//
// Local testing:  stripe listen --forward-to localhost:3000/api/stripe/webhook

export const dynamic = "force-dynamic";

const HANDLED = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function customerIdFrom(event: Stripe.Event): string | null {
  const object = event.data.object as { customer?: string | { id: string } | null };
  const customer = object.customer;
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Stripe webhook not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    // Bad signature, replayed timestamp, tampered body - all land here.
    console.error("[stripe] signature verification failed:", err instanceof Error ? err.message : err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return Response.json({ received: true, ignored: event.type });
  }

  const customerId = customerIdFrom(event);
  if (!customerId) {
    console.warn(`[stripe] ${event.type} carried no customer id`);
    return Response.json({ received: true });
  }

  try {
    const result = await syncSubscriptionForCustomer(customerId);
    if (result && result.fromTier !== result.toTier) {
      console.log(`[stripe] ${event.type}: user ${result.userId} ${result.fromTier} -> ${result.toTier} (${result.status})`);
    }
  } catch (err) {
    // A 500 tells Stripe to retry with backoff, which is what we want on a
    // transient DB or API blip - the sync is idempotent.
    console.error(`[stripe] sync failed for ${event.type}:`, err instanceof Error ? err.message : err);
    return new Response("Sync failed", { status: 500 });
  }

  return Response.json({ received: true });
}
