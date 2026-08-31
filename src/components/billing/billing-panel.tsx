"use client";

import { useActionState } from "react";
import { setTier, type BillingDetail } from "@/lib/actions/billing";
import { createCheckoutSession, createPortalSession } from "@/lib/actions/checkout";
import { TIER_LIMITS } from "@/lib/billing";
import type { SubscriptionTier } from "@/lib/supabase/types";

const TIER_ORDER: SubscriptionTier[] = ["free", "premium"];

// useActionState passes (prevState, formData); neither is needed here - these
// only start a Stripe-hosted redirect and surface any error string.
async function checkoutAction(): Promise<string | null> {
  return (await createCheckoutSession()) ?? null;
}
async function portalAction(): Promise<string | null> {
  return (await createPortalSession()) ?? null;
}

export function BillingPanel({ detail }: { detail: BillingDetail }) {
  const [error, formAction] = useActionState(setTier, null);
  const [checkoutError, checkout] = useActionState(checkoutAction, null);
  const [portalError, portal] = useActionState(portalAction, null);
  const { usage, renewsAt, billingEnabled, hasStripeCustomer } = detail;
  const usagePct = usage.unlimited ? 100 : usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0;
  const actionError = [error, checkoutError, portalError].find((e) => e && e !== "saved");

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl text-primary">Billing</h2>
        <p className="mt-1 text-[13px] text-muted">
          {billingEnabled
            ? "Premium is billed monthly through Stripe. Manage your card, invoices, or cancellation from the Stripe portal; your plan updates here automatically once Stripe confirms it."
            : "No payment processor is live on this build yet. Switching plans below is free and instant - it exists so AI-tier gating can be tested before real billing goes live."}
        </p>
      </div>

      <div className="rounded-card border border-line bg-panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-[0.06em] text-muted uppercase">Current plan</div>
            <div className="mt-1 font-serif text-xl text-primary capitalize">{usage.tier}</div>
            {renewsAt && (
              <div className="mt-1 text-[12px] text-muted">
                Renews {new Date(renewsAt).toLocaleDateString(undefined, { dateStyle: "long" })}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[11px] tracking-[0.06em] text-muted uppercase">AI analyses this month</div>
            <div className="mt-1 text-[14px] text-primary">
              {usage.unlimited ? `${usage.used} · no cap` : `${usage.used} / ${usage.limit}`} · {usage.periodLabel}
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-active">
          <div
            className={`h-full rounded-full ${!usage.unlimited && usagePct >= 100 ? "bg-warning" : "bg-accent"}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        {usage.unlimited ? (
          <p className="mt-2 text-[12px] text-muted">Admin account — no analysis cap.</p>
        ) : (
          usage.remaining === 0 && (
            <p className="mt-2 text-[12px] text-warning">Limit reached for this month. It resets on the 1st.</p>
          )
        )}

        {usage.tier === "premium" && hasStripeCustomer && (
          <form action={portal} className="mt-4">
            <button
              type="submit"
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary hover:bg-active"
            >
              Manage billing in Stripe
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TIER_ORDER.map((tier) => {
          const config = TIER_LIMITS[tier];
          const isCurrent = tier === usage.tier;
          const isUpgrade = tier === "premium" && usage.tier === "free";
          return (
            <div key={tier} className="rounded-card border border-line bg-panel p-6">
              <div className="mb-1 text-[15px] font-semibold text-primary">{config.label}</div>
              <div className="mb-4 text-[13px] text-muted">
                {config.monthlyAiAnalyses} AI analyses / month ·{" "}
                {config.dailyChatMessages === null ? "unlimited chat" : `${config.dailyChatMessages} chats / day`} ·{" "}
                {config.analysisDepth === "full" ? "full methodology depth" : "top-line methodology"}
              </div>

              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-default rounded-lg border border-line px-3.5 py-2 text-[13px] text-muted"
                >
                  Current plan
                </button>
              ) : isUpgrade && billingEnabled ? (
                <form action={checkout}>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-3.5 py-2 text-[13px] font-semibold text-canvas hover:shadow-[0_0_22px_rgba(47,198,133,0.35)]"
                  >
                    Upgrade to Premium
                  </button>
                </form>
              ) : (
                <form action={formAction}>
                  <input type="hidden" name="tier" value={tier} />
                  <button
                    type="submit"
                    disabled={isUpgrade && !billingEnabled}
                    title={isUpgrade && !billingEnabled ? "Payments aren't set up yet." : undefined}
                    className="w-full rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary hover:bg-active disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUpgrade ? "Upgrade to Premium" : `Switch to ${config.label}`}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      {actionError && <p className="text-[13px] text-negative">{actionError}</p>}
    </div>
  );
}
