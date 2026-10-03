"use client";

import { useActionState } from "react";
import { removeFromWaitlist, type RemoveState } from "@/lib/actions/waitlist";
import { BUTTON_PRIMARY } from "@/components/front-door/styles";

const INITIAL: RemoveState = { status: "idle" };

export function RemoveForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(removeFromWaitlist, INITIAL);

  if (state.status === "removed") {
    return (
      <p role="status" className="mt-6 border-t border-line-soft pt-4 text-lead leading-relaxed text-primary text-pretty">
        You&apos;re off the waitlist, and we won&apos;t email you again.
      </p>
    );
  }
  if (state.status === "not-found") {
    return (
      <p role="status" className="mt-6 border-t border-line-soft pt-4 text-lead leading-relaxed text-primary text-pretty">
        You&apos;re already off the waitlist. Nothing more to do.
      </p>
    );
  }

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} w-full`}>
        {pending ? "Removing…" : "Yes, remove me"}
      </button>
      {state.status === "error" ? (
        <p role="alert" className="mt-3 text-body text-negative">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
