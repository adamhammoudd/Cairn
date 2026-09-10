"use client";

import { useActionState } from "react";
import { setTier, type BillingDetail } from "@/lib/actions/billing";
import { createCheckoutSession, createPortalSession } from "@/lib/actions/checkout";
import { TIER_LIMITS } from "@/lib/billing";
import { nextResetLabel } from "@/lib/chat-state";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";

// Settings > Billing, transcribed from Cairn Settings.dc.html: a plan card
// (gradient + glow on Premium) beside a "This period" usage card, then payment
// history, then the tier-vs-methodology footnote.
//
// Stripe wiring is unchanged from the Phase 12 build: the webhook is the only
// thing that grants Premium; this screen only opens Stripe-hosted flows.

async function checkoutAction(): Promise<string | null> {
  return (await createCheckoutSession()) ?? null;
}
async function portalAction(): Promise<string | null> {
  return (await createPortalSession()) ?? null;
}

function Meter({
  label,
  readout,
  pct,
  atCap,
  sub,
}: {
  label: string;
  readout: string;
  pct: number;
  atCap: boolean;
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-primary">{label}</span>
        <span className={`font-mono text-caption tabular-nums ${atCap ? "text-warning" : "text-muted"}`}>{readout}</span>
      </div>
      <div className="mt-2 h-[5px] overflow-hidden rounded-xs bg-active">
        <div
          className={`h-full rounded-xs ${atCap ? "bg-warning" : "bg-gradient-to-r from-accent-light to-accent-dark"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="mt-2 text-micro leading-[1.5] text-dim text-pretty">{sub}</div>
    </div>
  );
}

export function BillingSettingsPanel({ detail }: { detail: BillingDetail }) {
  const prefs = useDisplayPrefs();
  const [error, formAction] = useActionState(setTier, null);
  const [checkoutError, checkout] = useActionState(checkoutAction, null);
  const [portalError, portal] = useActionState(portalAction, null);
  const { usage, chat, renewsAt, history, billingEnabled, hasStripeCustomer } = detail;
  const premium = usage.tier === "premium";
  const config = TIER_LIMITS[usage.tier];
  const actionError = [error, checkoutError, portalError].find((e) => e && e !== "saved");

  const analysesAtCap = !usage.unlimited && usage.remaining <= 0;
  const chatCapped = !chat.unlimited && chat.limit !== null;
  const chatAtCap = chatCapped && (chat.remaining ?? 0) <= 0;
  const adminNote = "Admin account — no cap. Shown for your own tracking.";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 items-start gap-3.5 min-[1000px]:grid-cols-[1.35fr_1fr]">
        {/* Plan card */}
        <div
          className={`relative overflow-hidden rounded-card border bg-gradient-to-b from-raised to-panel ${
            premium ? "border-[rgba(47,198,133,0.35)]" : "border-line"
          }`}
        >
          {premium && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(420px 160px at 15% 0%, rgba(47,198,133,0.12), transparent 72%)" }}
            />
          )}
          <div className="relative p-5">
            <div className="flex flex-wrap items-start justify-between gap-3.5">
              <div className="min-w-0">
                <div
                  className={`font-mono text-eyebrow uppercase ${premium ? "text-accent" : "text-muted"}`}
                >
                  Current plan
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-2.5">
                  <span className="font-serif text-h1 leading-none text-primary">{config.label}</span>
                  {/* Was a hardcoded "$0" - the free plan's price is genuinely
                      zero regardless of currency, but the symbol in front of it
                      should still match Settings > Display like every other
                      figure in the app (Stripe's own price isn't shown here at
                      all, precisely to avoid a mismatch - $0 is the one figure
                      safe to render locally since 0 converts to 0 in any currency). */}
                  <span className="text-body text-muted">{premium ? "billed monthly" : formatMoney(0, prefs)}</span>
                </div>
                <p className="mt-2.5 max-w-[380px] text-body leading-[1.55] text-muted text-pretty">
                  {premium
                    ? "Unlimited chat and full methodology detail on every answer, plus new surfaces as they ship."
                    : "Capped analyses and chat each period, with top-line methodology on every answer. Caveats and confidence are identical on both plans."}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {!premium ? (
                  billingEnabled ? (
                    <form action={checkout}>
                      <button
                        type="submit"
                        className="rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-4.5 py-3 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.28)]"
                      >
                        Upgrade to Premium
                      </button>
                    </form>
                  ) : (
                    <form action={formAction}>
                      <input type="hidden" name="tier" value="premium" />
                      <button
                        type="submit"
                        disabled
                        title="Premium isn't available yet - payments aren't set up."
                        className="cursor-not-allowed rounded-panel border border-line px-4.5 py-3 text-body font-semibold text-dim"
                      >
                        Upgrade to Premium
                      </button>
                    </form>
                  )
                ) : hasStripeCustomer ? (
                  <form action={portal}>
                    <button
                      type="submit"
                      className="rounded-panel border border-line px-4.5 py-3 text-body font-semibold text-primary transition-colors duration-fast ease-standard hover:border-line-strong"
                    >
                      Manage plan
                    </button>
                  </form>
                ) : (
                  <form action={formAction}>
                    <input type="hidden" name="tier" value="free" />
                    <button
                      type="submit"
                      className="rounded-panel border border-line px-4.5 py-3 text-body font-semibold text-primary transition-colors duration-fast ease-standard hover:border-line-strong"
                    >
                      Downgrade to Free
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="mt-4.5 flex flex-wrap gap-x-5.5 gap-y-3 border-t border-line-soft pt-4">
              <div>
                <div className="font-mono text-eyebrow text-dim uppercase">
                  {premium ? "Renews" : "Allowance resets"}
                </div>
                <div className="mt-1.5 text-body text-primary">
                  {renewsAt
                    ? new Date(renewsAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
                    : nextResetLabel()}
                </div>
              </div>
              <div>
                <div className="font-mono text-eyebrow text-dim uppercase">Billing period</div>
                <div className="mt-1.5 text-body text-primary">{premium ? "Monthly" : "Monthly · no charge"}</div>
              </div>
              <div>
                <div className="font-mono text-eyebrow text-dim uppercase">Payment method</div>
                <div className={`mt-1.5 text-body ${premium && hasStripeCustomer ? "text-primary" : "text-dim"}`}>
                  {premium && hasStripeCustomer ? "Managed in Stripe" : "None on file"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage card */}
        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5 border-b border-line-soft px-4 py-4">
            <span className="font-mono text-eyebrow text-muted uppercase">This period</span>
            <span className="text-micro text-dim">Resets {nextResetLabel()}</span>
          </div>
          <div className="flex flex-col gap-4.5 p-4">
            <Meter
              label="AI analyses"
              readout={usage.unlimited ? `${usage.used} · no cap` : `${usage.used} / ${usage.limit}`}
              pct={usage.unlimited ? 100 : (usage.used / usage.limit) * 100}
              atCap={analysesAtCap}
              sub={
                usage.unlimited
                  ? adminNote
                  : analysesAtCap
                    ? "Allowance used. Resets at the start of the next period."
                    : `${config.label}-plan allowance for the current period.`
              }
            />
            <Meter
              label="Chat messages"
              readout={chatCapped ? `${chat.used} / ${chat.limit}` : `${chat.used} used`}
              pct={chatCapped ? (chat.used / (chat.limit ?? 1)) * 100 : 100}
              atCap={chatAtCap}
              sub={
                chatCapped
                  ? `${config.label}-plan allowance, resets at midnight.`
                  : usage.unlimited
                    ? adminNote
                    : "Unlimited on Premium. Shown for your own tracking."
              }
            />
            <div className="border-t border-line-soft pt-3.5 text-micro leading-[1.55] text-dim text-pretty">
              The same meter component the Research page&rsquo;s quota indicator shows and the same count the
              generation gate enforces — one source of truth.
            </div>
          </div>
        </div>
      </div>

      {actionError && <div className="text-body text-warning">{actionError}</div>}

      {/* Payment / plan history */}
      <div className="overflow-hidden rounded-card border border-line bg-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-soft px-4.5 py-4">
          <span className="font-serif text-h3 text-primary">
            {premium && hasStripeCustomer ? "Plan history" : "Payment history"}
          </span>
          {premium && hasStripeCustomer && (
            <form action={portal}>
              <button
                type="submit"
                className="rounded-control border border-line px-3 py-2 text-caption text-dim transition-colors duration-fast ease-standard hover:border-line-strong hover:text-primary"
              >
                Invoices in Stripe →
              </button>
            </form>
          )}
        </div>

        {history.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-[38px] items-end justify-center gap-1">
              <span className="h-2 w-[30px] rounded-full bg-active" />
              <span className="h-2 w-[22px] rounded-full bg-active" />
              <span className="h-2 w-[15px] rounded-full bg-active" />
            </div>
            <div className="font-serif text-h3 text-primary">Nothing billed yet</div>
            <p className="mx-auto mt-2 max-w-[380px] text-body leading-[1.6] text-muted text-pretty">
              {billingEnabled
                ? "You're on the Free plan, so there's nothing to invoice. Upgrade and receipts appear in the Stripe portal and go to your email."
                : "You're on the Free plan. Plan changes will appear here; Stripe billing isn't live on this build yet."}
            </p>
          </div>
        ) : (
          <ul>
            {history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-baseline gap-x-2.5 border-b border-line-soft px-4.5 py-3 text-body last:border-b-0"
              >
                <span className="font-mono text-micro tabular-nums text-dim">
                  {new Date(h.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </span>
                <span className="text-primary">
                  {h.fromTier ? `${TIER_LIMITS[h.fromTier].label} → ` : ""}
                  {TIER_LIMITS[h.toTier].label}
                </span>
                <span className="text-muted">
                  {h.amountCents === null
                    ? "no charge"
                    : (h.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: h.currency ?? "USD" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footnote */}
      <div className="flex gap-3 rounded-panel border border-line bg-canvas px-4 py-4">
        <span className="w-1 shrink-0 rounded-xs bg-warning" />
        <div className="min-w-0 text-caption leading-[1.6] text-muted text-pretty">
          Plan tier changes how much methodology detail is shown — never the analysis itself, its confidence range, or
          its caveats. Downgrading keeps everything you&rsquo;ve already generated readable.
        </div>
      </div>
    </div>
  );
}
