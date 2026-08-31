// Unit test for the Stripe billing wiring (src/lib/stripe.ts + the webhook).
//
// Covers the two pieces that must be right for money to map to the right tier
// and for a forged request to be rejected:
//   1. tierForStripeStatus - which Stripe statuses grant premium
//   2. webhook signature verification - a body with no / a wrong signature is
//      refused before any handler runs
//
// It does NOT hit Stripe's API. A dummy client is constructed locally and only
// its offline crypto (constructEvent / generateTestHeaderString) is exercised.
//
// Run: npm run test:stripe-webhook

import Stripe from "stripe";
import { tierForStripeStatus } from "@/lib/stripe";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const SECRET = "whsec_test_do_not_use_in_prod";
const client = new Stripe("sk_test_dummy_key_for_offline_crypto_only", { apiVersion: "2026-08-26.dahlia" });

export function runStripeWebhookSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // ---- status -> tier ----
  cases.push(check("active grants premium", tierForStripeStatus("active") === "premium", "active"));
  cases.push(check("trialing grants premium", tierForStripeStatus("trialing") === "premium", "trialing"));
  cases.push(check("past_due keeps premium through the grace window", tierForStripeStatus("past_due") === "premium", "past_due"));
  cases.push(check("canceled drops to free", tierForStripeStatus("canceled") === "free", "canceled"));
  cases.push(check("unpaid drops to free", tierForStripeStatus("unpaid") === "free", "unpaid"));
  cases.push(check("incomplete_expired drops to free", tierForStripeStatus("incomplete_expired") === "free", "incomplete_expired"));

  // ---- signature verification ----
  const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: { customer: "cus_1" } } });

  const goodHeader = client.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  let verified = false;
  try {
    const event = client.webhooks.constructEvent(payload, goodHeader, SECRET);
    verified = event.type === "customer.subscription.updated";
  } catch {
    verified = false;
  }
  cases.push(check("a correctly-signed body verifies", verified, "constructEvent returned the event"));

  let rejectedWrongSecret = false;
  try {
    client.webhooks.constructEvent(payload, goodHeader, "whsec_a_different_secret");
  } catch {
    rejectedWrongSecret = true;
  }
  cases.push(check("a body signed with a different secret is rejected", rejectedWrongSecret, "constructEvent threw"));

  let rejectedTampered = false;
  try {
    client.webhooks.constructEvent(payload + " ", goodHeader, SECRET);
  } catch {
    rejectedTampered = true;
  }
  cases.push(check("a tampered body is rejected", rejectedTampered, "constructEvent threw"));

  let rejectedNoSig = false;
  try {
    client.webhooks.constructEvent(payload, "", SECRET);
  } catch {
    rejectedNoSig = true;
  }
  cases.push(check("an empty signature header is rejected", rejectedNoSig, "constructEvent threw"));

  return { suiteName: "Stripe billing wiring", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("stripe-webhook.ts")) {
  const suite = runStripeWebhookSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} stripe-webhook cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
