// "Beta: full Premium access until <date>" - shown in Billing, Settings >
// Billing and the assistant sidebar while BETA_PREMIUM_UNTIL is set. The date
// comes from the server (getBetaAccessLabel / BillingDetail.betaUntil); this
// component never decides whether beta is on.
export function BetaNote({ until, compact = false }: { until: string; compact?: boolean }) {
  return (
    <div
      role="note"
      className={`rounded-control border border-[rgba(47,198,133,0.35)] bg-[rgba(47,198,133,0.08)] text-accent ${
        compact ? "px-2.5 py-1.5 text-micro" : "px-3.5 py-2.5 text-body"
      }`}
    >
      <span className="font-semibold">Beta:</span> full Premium access until {until}
      {!compact && <span className="text-muted"> - nothing to pay, and no card needed.</span>}
    </div>
  );
}
