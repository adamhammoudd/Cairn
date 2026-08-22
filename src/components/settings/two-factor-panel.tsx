"use client";

import { useActionState } from "react";
import { setTwoFactorInterest } from "@/lib/actions/settings";
import type { TwoFactorStatus } from "@/lib/supabase/types";

// An honest placeholder, not a dead control.
//
// Two-factor authentication is not implemented: there is no TOTP enrolment, no
// recovery codes and no second-factor check at sign-in. A toggle that looked
// like it enabled 2FA would be the worst possible lie for a security control,
// so this states plainly what exists today, names what enrolling will involve
// when it ships, and records a real preference in the meantime.
export function TwoFactorPanel({ status }: { status: TwoFactorStatus }) {
  const [state, formAction, pending] = useActionState(setTwoFactorInterest, null);
  const current = (state === "requested" || state === "not_enrolled" ? state : status) as TwoFactorStatus;
  const requested = current === "requested";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-[52ch]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-primary">Two-factor authentication</span>
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-muted uppercase">
            Not available yet
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted text-pretty">
          Sign-in is password-only today. When two-factor ships it will use an authenticator app (TOTP) plus one-time
          recovery codes; SMS is not planned. Nothing on this screen protects your account yet - it would be
          misleading to show a switch that did nothing.
        </p>
        {requested && (
          <p className="mt-1.5 text-[12.5px] text-accent">
            You&rsquo;re on the list. We&rsquo;ll prompt you to enrol the first time you sign in after it ships.
          </p>
        )}
      </div>
      <form action={formAction} className="shrink-0">
        <input type="hidden" name="two_factor_status" value={requested ? "not_enrolled" : "requested"} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active disabled:opacity-60"
        >
          {pending ? "Saving…" : requested ? "Remove me from the list" : "Notify me when it ships"}
        </button>
      </form>
    </div>
  );
}
