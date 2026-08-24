"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setTier, type BillingDetail } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import { nextResetLabel } from "@/lib/chat-state";
import type { SubscriptionTier } from "@/lib/supabase/types";

const ROW = "cn-row border-b border-[#171717] px-4.5 py-3.75 last:border-b-0";

function Meter({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div className="mt-2 h-1.5 max-w-[280px] overflow-hidden rounded-full bg-active">
      <div className={`h-full rounded-full ${pct >= 100 ? "bg-warning" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Settings > Billing.
 *
 * The usage figures come from getBillingDetail(), which calls the very same
 * getBillingSummary() / getChatUsageSummary() the Research page's quota
 * indicator and the chat gate call. They are one count rendered twice, not two
 * counts that happen to agree today.
 */
export function BillingSettingsPanel({ detail }: { detail: BillingDetail }) {
  const [error, formAction] = useActionState(setTier, null);
  const { usage, chat, renewsAt, history, billingEnabled } = detail;
  const tier = usage.tier;
  const config = TIER_LIMITS[tier];
  const other: SubscriptionTier = tier === "free" ? "premium" : "free";

  return (
    <>
      <div className={`flex flex-wrap items-start justify-between gap-4 ${ROW}`}>
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] tracking-[0.14em] text-muted uppercase">Current plan</div>
          <div className="mt-1.5 font-serif text-[20px] text-primary">{config.label}</div>
          <div className="mt-1.5 max-w-[52ch] text-[11.5px] leading-relaxed text-muted text-pretty">
            {renewsAt ? (
              <>Renews {new Date(renewsAt).toLocaleDateString(undefined, { dateStyle: "long" })}.</>
            ) : (
              // Never invent a date. Nothing is billed, so nothing renews, and
              // printing a made-up "renews on" line would be the one lie a
              // billing screen must not tell.
              <>
                No renewal date: nothing is being billed. There is no payment processor wired up in this build, so no
                card is on file and no charge has been made.
              </>
            )}
          </div>
        </div>

        <form action={formAction} className="shrink-0">
          <input type="hidden" name="tier" value={other} />
          <button
            type="submit"
            disabled={other === "premium" && !billingEnabled}
            title={
              other === "premium" && !billingEnabled
                ? "Premium isn't available yet - payments aren't set up."
                : undefined
            }
            className="rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active disabled:cursor-not-allowed disabled:opacity-50"
          >
            {other === "premium" ? "Upgrade to Premium" : "Downgrade to Free"}
          </button>
        </form>
      </div>

      {error && error !== "saved" && (
        <div className={`${ROW} text-[12.5px] text-warning`}>{error}</div>
      )}

      <div className={ROW}>
        <div className="text-[13px] text-primary">AI analyses this period</div>
        <div className="mt-1 text-[11.5px] text-muted">
          {usage.used} of {usage.limit} used · {usage.remaining} remaining · {usage.periodLabel} · resets{" "}
          {nextResetLabel()}
        </div>
        <Meter used={usage.used} limit={usage.limit} />
        <div className="mt-2 text-[11px] text-dim text-pretty">
          The same count the Research page&rsquo;s quota indicator shows and the same one the generation gate enforces
          — one figure, read from one place.
        </div>
      </div>

      <div className={ROW}>
        <div className="text-[13px] text-primary">Chat messages today</div>
        <div className="mt-1 text-[11.5px] text-muted">
          {chat.limit === null ? (
            <>{chat.used} used · unlimited on {config.label}</>
          ) : (
            <>
              {chat.used} of {chat.limit} used · {chat.remaining} remaining · resets at midnight
            </>
          )}
        </div>
        {chat.limit !== null && <Meter used={chat.used} limit={chat.limit} />}
      </div>

      <div className={ROW}>
        <div className="text-[13px] text-primary">Plan history</div>
        <div className="mt-1 max-w-[56ch] text-[11.5px] leading-relaxed text-muted text-pretty">
          Every plan change on this account. Not a payment history — no payments exist, because no payment processor
          is wired up. When one is, its charges appear here alongside these rows.
        </div>
        {history.length === 0 ? (
          <div className="mt-2.5 text-[12px] text-dim">No plan changes yet.</div>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2.5 text-[12px]">
                <span className="font-mono text-[10.5px] text-dim">
                  {new Date(h.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </span>
                <span className="text-primary">
                  {h.fromTier ? `${TIER_LIMITS[h.fromTier].label} → ` : ""}
                  {TIER_LIMITS[h.toTier].label}
                </span>
                <span className="text-muted">
                  {h.amountCents === null
                    ? "no charge"
                    : `${(h.amountCents / 100).toLocaleString(undefined, {
                        style: "currency",
                        currency: h.currency ?? "USD",
                      })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-4 ${ROW}`}>
        <div className="min-w-0 text-[11.5px] text-muted">Plan comparison and the full usage breakdown.</div>
        <Link
          href="/billing"
          className="shrink-0 rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
        >
          Billing page →
        </Link>
      </div>
    </>
  );
}
