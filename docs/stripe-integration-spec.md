# Stripe integration spec (Phase 12)

**Status:** code landed on `worktree-aug31-founder-punchlist`; **not yet run
end-to-end** — needs a Stripe account + keys (founder). Test mode first, live
keys only once a full test-mode run has passed.

This is the reusable runbook the task asked for. There was no prior Stripe spec
in the repo (README and the 2026-08-30 audit both say billing was unbuilt); the
roadmap Phase 12 outline is the source this was built from.

---

## 1. What was built

| Piece | File |
|---|---|
| Server Stripe client, config check, status→tier map, customer→sub sync | `src/lib/stripe.ts` |
| Checkout + Customer Portal server actions | `src/lib/actions/checkout.ts` |
| Signature-verified webhook | `src/app/api/stripe/webhook/route.ts` |
| Gate (`getUserPlan`, usage checks) — unchanged, already routed through `subscriptions.tier` | `src/lib/actions/billing.ts` |
| Billing UI (page + Settings panel) — checkout / portal / downgrade | `src/components/billing/billing-panel.tsx`, `src/components/settings/billing-settings-panel.tsx` |
| Offline unit tests (status map + signature verification) | `scripts/tests/stripe-webhook.ts` (`npm run test:stripe-webhook`) |

**Schema:** already Stripe-ready. `subscriptions` carries `stripe_customer_id`,
`stripe_subscription_id`, `status`, `current_period_end`, `updated_at` (added by
an earlier migration); `subscription_events` records tier changes with a
`source` column. No new migration required.

**Design invariant:** the **webhook is the only writer of a premium tier.**
Checkout and the portal just open Stripe-hosted pages. A user who abandons
checkout, or forges the `?checkout=success` redirect, gets nothing. `setTier()`
still exists but only downgrades (or, with `BILLING_ENABLED` unset, acts as the
pre-launch self-serve stub).

---

## 2. Configuration

### 2a. Stripe dashboard (Test mode)

1. **Product + Price** — create a "Cairn Premium" product with a recurring
   monthly price. Copy the **Price id** (`price_...`) → `STRIPE_PRICE_PREMIUM`.
2. **API key** — Developers → API keys → copy the **Secret key** (`sk_test_...`)
   → `STRIPE_SECRET_KEY`.
3. **Customer Portal** — Settings → Billing → Customer portal → activate, allow
   "cancel subscription" and "update payment method".
4. **Webhook endpoint** — Developers → Webhooks → add endpoint
   `https://<domain>/api/stripe/webhook`, events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`. Copy the **Signing secret**
   (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

### 2b. Environment (`.env.local`, then Vercel)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_PREMIUM=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://<domain>      # already used by the waitlist
BILLING_ENABLED=true                       # gate; also requires the key above
```

`billingEnabled()` = `BILLING_ENABLED === "true"` **AND** `stripeConfigured()`.
A half-configured deploy shows the pre-launch stub, never a button that 500s.

---

## 3. Local end-to-end test (Test mode)

```
# terminal 1
npm run dev
# terminal 2 — forwards live test events and prints the whsec_ to use
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

1. **Checkout** — sign in, go to `/billing` → "Upgrade to Premium" → redirected
   to Stripe Checkout. Pay with `4242 4242 4242 4242`, any future expiry, any CVC.
2. **Grant** — `stripe listen` shows `checkout.session.completed` +
   `customer.subscription.created` → the route returns `{received:true}` and
   logs `free -> premium`. Reload `/billing`: plan reads **Premium**, a "Renews
   <date>" line appears, `subscription_events` has a `source='stripe'` row.
3. **Gate** — the Research page quota now shows the Premium limit; chat is
   uncapped (`TIER_LIMITS.premium.dailyChatMessages === null`).
4. **Portal** — "Manage billing" → Stripe portal → cancel. `stripe trigger
   customer.subscription.deleted` (or wait) → webhook syncs tier back to
   **free**, a second `subscription_events` row is written.
5. **Signature** — `curl -XPOST localhost:3000/api/stripe/webhook -d '{}'` →
   **400 Invalid signature**, nothing written. (`npm run test:stripe-webhook`
   covers this offline: wrong-secret, tampered-body, empty-sig all rejected.)
6. **Failed payment** — `stripe trigger invoice.payment_failed` → status becomes
   `past_due`; `tierForStripeStatus` keeps Premium through Stripe's grace
   window, drops to free on the eventual `deleted`.

## 4. Go-live

Only after §3 fully passes: swap `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PREMIUM`,
`STRIPE_WEBHOOK_SECRET` for **live-mode** values, recreate the webhook endpoint
in live mode, redeploy. Run one real card through checkout and immediately
cancel + refund from the dashboard to confirm the live path.

## 5. Open questions for the founder

- **Price point** — not set anywhere yet. Positioning implies a single monthly
  Premium tier; the amount is a founder/CFO call.
- **Premium analysis cap** — `TIER_LIMITS.premium.monthlyAiAnalyses` is `100`,
  but `/billing` and the waitlist say "unlimited". Decide which is true and
  align both (tracked in the incoherence sweep, item 12).
- **Trial?** — no trial is configured. `tierForStripeStatus` already treats
  `trialing` as Premium if one is added later.
- **Proration / annual plan** — out of scope for this pass.
