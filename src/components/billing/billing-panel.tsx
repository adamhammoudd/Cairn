"use client";

import { useActionState } from "react";
import { setTier } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import type { UsageSummary } from "@/lib/billing";
import type { SubscriptionTier } from "@/lib/supabase/types";

const TIER_ORDER: SubscriptionTier[] = ["free", "premium"];

export function BillingPanel({ summary }: { summary: UsageSummary }) {
  const [error, formAction] = useActionState(setTier, null);
  const usagePct = summary.limit > 0 ? Math.min((summary.used / summary.limit) * 100, 100) : 0;

  return (
    <div>
      <div>
        <h2>Billing</h2>
        <p>
          No real payment processor is wired up yet — this is a pre-launch build. Switching plans below is
          free and instant; it exists so AI-tier gating can be tested before real billing goes live.
        </p>
      </div>

      <div>
        <div>
          <div>
            <div>Current plan</div>
            <div>{summary.tier}</div>
          </div>
          <div>
            <div>AI analyses this month</div>
            <div>
              {summary.used} / {summary.limit} · {summary.periodLabel}
            </div>
          </div>
        </div>

        <div>
          <div

 />
        </div>
        {summary.remaining === 0 && (
          <p>
            Limit reached for this month. Switch to a higher plan below or wait until next month.
          </p>
        )}
      </div>

      <div>
        {TIER_ORDER.map((tier) => {
          const config = TIER_LIMITS[tier];
          const isCurrent = tier === summary.tier;
          return (
            <div key={tier}>
              <div>{config.label}</div>
              <div>{config.monthlyAiAnalyses} AI analyses / month</div>
              <form action={formAction}>
                <input type="hidden" name="tier" value={tier} />
                <button
                  type="submit"
                  disabled={isCurrent}

 >
                  {isCurrent ? "Current plan" : `Switch to ${config.label}`}
                </button>
              </form>
            </div>
          );
        })}
      </div>
      {error && error !== "saved" && <p>{error}</p>}
    </div>
  );
}
