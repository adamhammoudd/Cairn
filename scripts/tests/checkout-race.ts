// Audit 2026-09-04, finding #8: a double-click or two open tabs on checkout
// could create two Stripe Customer records for one user - both calls saw
// stripe_customer_id still null and each ran stripe.customers.create(), the
// second silently orphaning the first.
//
// Fix: ensureStripeCustomer passes a per-user idempotency key to
// customers.create. Stripe caches the create response for 24h and returns the
// SAME customer for every call carrying the key, so racing requests converge.
//
// Run: npx tsx --conditions=react-server scripts/tests/checkout-race.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { customerIdempotencyKey } from "@/lib/stripe";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

// The key must be STABLE for one user (so concurrent clicks share it) and
// DISTINCT between users (so two people never share a Customer).
check("the key is stable across calls for one user", customerIdempotencyKey(A) === customerIdempotencyKey(A));
check("the key differs between users", customerIdempotencyKey(A) !== customerIdempotencyKey(B));
check("the key is derived from the user id", customerIdempotencyKey(A).includes(A));

// The action wires it into customers.create.
const ROOT = join(import.meta.dirname, "..", "..");
const checkout = readFileSync(join(ROOT, "src/lib/actions/checkout.ts"), "utf8");

check(
  "customers.create is called with an idempotencyKey",
  /customers\.create\([\s\S]{0,200}?idempotencyKey:\s*customerIdempotencyKey\(/.test(checkout),
  "no idempotency key on the create call",
);
check(
  "the pre-check for an existing customer is still there",
  /stripe_customer_id[\s\S]{0,200}?if \(row\?\.stripe_customer_id\) return/.test(checkout),
  "lost the fast path for a user who already has a customer",
);

console.log(`\n${pass}/${pass + fail} checkout-race cases passed`);
process.exit(fail === 0 ? 0 : 1);
