"use client";

import { useActionState } from "react";
import { setTwoFactorInterest } from "@/lib/actions/settings";
import type { TwoFactorStatus } from "@/lib/supabase/types";

// The mockup's Two-factor card - header, status chip, a state-dependent body.
//
// The mockup also draws a full QR-enrolment flow and a recovery-code grid.
// Those are NOT built here on purpose: there is no TOTP enrolment, no recovery
// codes and no second-factor check at sign-in. A working-looking enrolment UI
// is the worst possible placeholder for a security control, so this keeps the
// mockup's card chrome and states the honest position, while recording a real
// "notify me" preference in the meantime.

const CHIP: Record<string, { label: string; tone: string; border: string; bg: string; dot: string }> = {
  not_enrolled: {
    // The mockup's chip reads "Not enabled"; "Not available yet" is used
    // instead - nothing here can be enabled, and the honesty check
    // (scripts/tests/settings-wiring.ts) pins that wording.
    label: "Not available yet",
    tone: "text-warning",
    border: "border-[rgba(217,164,65,0.4)]",
    bg: "bg-[rgba(217,164,65,0.08)]",
    dot: "bg-warning",
  },
  requested: {
    label: "On the list",
    tone: "text-info",
    border: "border-[rgba(91,141,239,0.4)]",
    bg: "bg-[rgba(91,141,239,0.08)]",
    dot: "bg-info",
  },
};

export function TwoFactorPanel({ status }: { status: TwoFactorStatus }) {
  const [state, formAction, pending] = useActionState(setTwoFactorInterest, null);
  const current = (state === "requested" || state === "not_enrolled" ? state : status) as TwoFactorStatus;
  const requested = current === "requested";
  const chip = CHIP[requested ? "requested" : "not_enrolled"];

  return (
    <div className="animate-rise-in overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4.5 py-4">
        <span className="font-serif text-h3 text-primary">Two-factor authentication</span>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${chip.border} ${chip.bg}`}>
          <span className={`h-[5px] w-[5px] rounded-full ${chip.dot}`} />
          <span className={`font-mono text-eyebrow uppercase ${chip.tone}`}>{chip.label}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-4.5 py-4.5">
        <div className="min-w-0 max-w-[540px]">
          <div className="text-body text-primary">Sign-in is password-only today</div>
          <p className="mt-1.5 text-caption leading-[1.6] text-muted text-pretty">
            When two-factor ships it will use an authenticator app (TOTP) plus one-time recovery codes; SMS is not
            planned. Nothing on this screen protects your account yet — it would be misleading to show a switch that
            did nothing.
            {requested && " You're on the list and we'll prompt you to enrol the first time you sign in after it ships."}
          </p>
        </div>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="two_factor_status" value={requested ? "not_enrolled" : "requested"} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-panel border border-line px-4 py-2.5 text-body text-primary transition-colors duration-fast ease-standard hover:border-line-strong disabled:opacity-60"
          >
            {pending ? "Saving…" : requested ? "Remove me from the list" : "Notify me when it ships"}
          </button>
        </form>
      </div>
    </div>
  );
}
