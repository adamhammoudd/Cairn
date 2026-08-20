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
    <div className="flex max-w-[900px] flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl text-primary">Billing</h2>
        <p className="mt-1 text-[13px] text-muted">
          No real payment processor is wired up yet - this is a pre-launch build. Switching plans below is
          free and instant; it exists so AI-tier gating can be tested before real billing goes live.
        </p>
      </div>

      <div className="rounded-card border border-line bg-panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-[0.06em] text-muted uppercase">Current plan</div>
            <div className="mt-1 font-serif text-xl text-primary capitalize">{summary.tier}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] tracking-[0.06em] text-muted uppercase">AI analyses this month</div>
            <div className="mt-1 text-[14px] text-primary">
              {summary.used} / {summary.limit} · {summary.periodLabel}
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-active">
          <div
            className={`h-full rounded-full ${usagePct >= 100 ? "bg-warning" : "bg-accent"}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        {summary.remaining === 0 && (
          <p className="mt-2 text-[12px] text-warning">
            Limit reached for this month. Switch to a higher plan below or wait until next month.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TIER_ORDER.map((tier) => {
          const config = TIER_LIMITS[tier];
          const isCurrent = tier === summary.tier;
          return (
            <div key={tier} className="rounded-card border border-line bg-panel p-6">
              <div className="mb-1 text-[15px] font-semibold text-primary">{config.label}</div>
              <div className="mb-4 text-[13px] text-muted">{config.monthlyAiAnalyses} AI analyses / month</div>
              <form action={formAction}>
                <input type="hidden" name="tier" value={tier} />
                <button
                  type="submit"
                  disabled={isCurrent}
                  className={`w-full rounded-lg px-3.5 py-2 text-[13px] ${
                    isCurrent
                      ? "cursor-default border border-line text-muted"
                      : "border border-line text-primary hover:bg-active"
                  }`}
                >
                  {isCurrent ? "Current plan" : `Switch to ${config.label}`}
                </button>
              </form>
            </div>
          );
        })}
      </div>
      {error && error !== "saved" && <p className="text-[13px] text-negative">{error}</p>}
    </div>
  );
}
