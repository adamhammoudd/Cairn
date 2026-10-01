"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { joinWaitlist, type JoinState } from "@/lib/actions/waitlist";
import { BUTTON_PRIMARY, EYEBROW, INPUT, INPUT_LABEL, TEXT_LINK } from "@/components/front-door/styles";

const JOIN_IDLE: JoinState = { status: "idle" };

const NEXT_STEP = "We invite people in batches, in the order they joined. You'll get an email with your personal link.";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} w-full`}>
      {pending ? "Joining…" : "Join the waitlist"}
    </button>
  );
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <span className={EYEBROW}>{eyebrow}</span>
      <h2 className="font-serif text-h1 font-normal text-primary">{title}</h2>
    </div>
  );
}

const BODY = "text-lead leading-relaxed text-muted text-pretty";

/** Lives inside the page's AuthCard - the same card the sign-in and invite pages use. */
export function WaitlistForm({
  foundingLimit,
  slotsRemaining,
}: {
  // Passed in from the page: FOUNDING_LIMIT lives in a server-only module.
  foundingLimit: number;
  slotsRemaining: number | null;
}) {
  const [state, formAction] = useActionState<JoinState, FormData>(joinWaitlist, JOIN_IDLE);
  // Controlled so a rejected submission (invalid address, rate-limited) keeps
  // what the visitor typed instead of clearing the field - React 19 resets
  // uncontrolled fields once a form action settles.
  const [email, setEmail] = useState("");

  // Stamp the visitor's IANA timezone onto the payload at dispatch time. The
  // previous approach - a hidden <input> filled by a mount effect through a ref
  // - never reached the submitted FormData (every row landed with tz=""), so
  // this is done here where the value provably makes it into the request.
  const submit = (formData: FormData) => {
    try {
      formData.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    } catch {
      /* Intl unavailable - the server treats a missing tz as unknown */
    }
    formAction(formData);
  };

  if (state.status === "pending") {
    return (
      <div role="status">
        <Heading eyebrow="Almost there" title="Check your inbox" />
        <p className={BODY}>
          {state.resent ? "We've re-sent a confirmation link to " : "We've sent a confirmation link to "}
          <span className="text-primary">{state.email}</span>. Your place is held once you click it. If
          you&apos;re among the first {foundingLimit} to confirm, that click is what locks the
          founding-member 2&nbsp;months of Premium to this address.
        </p>
        <p className={`mt-3 ${BODY}`}>{NEXT_STEP}</p>
        {!state.emailDelivered && (
          <p className="mt-4 rounded-panel border border-warning/40 bg-warning/8 px-3 py-2.5 text-caption leading-relaxed text-warning text-pretty">
            Email delivery isn&apos;t configured on this environment, so the link was written to the
            server log instead of sent. This must be set up before the page goes live.
          </p>
        )}
      </div>
    );
  }

  if (state.status === "already-confirmed") {
    return (
      <div role="status">
        <Heading eyebrow="Waitlist" title="You're already on the list" />
        <p className={BODY}>
          {state.position !== null ? (
            <>
              You&apos;re <span className="text-primary">#{state.position}</span>.{" "}
              {state.founding
                ? "As a founding member, your first 2 months of Premium are free - they start the day your access begins at launch, not today."
                : `You'll get standard access when Cairn launches; the ${foundingLimit} founding-member places were already taken.`}
            </>
          ) : (
            "We'll email you when your access is ready."
          )}
        </p>
        <p className={`mt-3 ${BODY}`}>{NEXT_STEP}</p>
      </div>
    );
  }

  return (
    <div>
      <Heading eyebrow="Early access" title="Get your place in line." />
      <p className={`mb-6 ${BODY}`}>
        Confirm your email and we add you to the list. {NEXT_STEP}
      </p>

      <form action={submit} noValidate>
        <label htmlFor="waitlist-email" className={INPUT_LABEL}>
          Email
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={state.status === "error" ? "waitlist-error" : undefined}
          className={INPUT}
        />
        {state.status === "error" && (
          <p
            id="waitlist-error"
            role="alert"
            className="mt-3 rounded-panel border border-warning/40 bg-warning/8 px-3 py-2.5 text-body text-warning"
          >
            {state.message}
          </p>
        )}
        <div className="mt-4">
          <SubmitButton />
        </div>
      </form>

      {slotsRemaining !== null && (
        <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-line-soft pt-4 text-body">
          <span className="text-muted">Founding places left</span>
          <span className="font-mono text-primary">
            {Math.max(0, slotsRemaining)} of {foundingLimit}
          </span>
        </p>
      )}

      <p className="mt-4 text-caption leading-relaxed text-muted text-pretty">
        One email to confirm, then one when your invite is ready. No newsletter. We store your email
        plus basic anti-abuse data (IP, browser).{" "}
        <Link href="/privacy" className={TEXT_LINK}>
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
