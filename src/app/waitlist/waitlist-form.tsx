"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { joinWaitlist, type JoinState } from "@/lib/actions/waitlist";

const JOIN_IDLE: JoinState = { status: "idle" };

function SubmitButton({ centered }: { centered?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`shrink-0 rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-5 py-3 text-lead font-semibold text-canvas transition-[box-shadow] duration-base ease-standard hover:shadow-[0_0_24px_rgba(47,198,133,0.35)] disabled:opacity-60 ${
        centered ? "" : ""
      }`}
    >
      {pending ? "Joining…" : "Join the waitlist"}
    </button>
  );
}

function Confirmed({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-panel border border-accent/40 bg-accent/[0.06] px-4 py-4">
      <p className="font-serif text-h3 leading-[1.25] text-primary">{title}</p>
      <p className="mt-1.5 text-body leading-[1.6] text-muted text-pretty">{children}</p>
    </div>
  );
}

export function WaitlistForm({ centered = false }: { centered?: boolean }) {
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

  const align = centered ? "mx-auto max-w-[440px] text-center" : "";

  if (state.status === "pending") {
    return (
      <div className={align}>
        <Confirmed title="Check your inbox">
          {state.resent ? "We've re-sent a confirmation link to " : "We've sent a confirmation link to "}
          <span className="text-primary">{state.email}</span>. Your place is held once you click it. If
          you&apos;re among the first 50 to confirm, that click is what locks the founding-member
          2&nbsp;months of Premium to this address.
        </Confirmed>
        {!state.emailDelivered && (
          <p className="mt-2.5 rounded-control border border-warning/40 bg-warning/8 px-2.5 py-2 text-caption leading-[1.5] text-warning text-pretty">
            Email delivery isn&apos;t configured on this environment, so the link was written to the
            server log instead of sent. This must be set up before the page goes live.
          </p>
        )}
      </div>
    );
  }

  if (state.status === "already-confirmed") {
    return (
      <div className={align}>
        <Confirmed title="You're already on the list">
          {state.position !== null ? (
            <>
              You&apos;re <span className="text-primary">#{state.position}</span>.{" "}
              {state.founding
                ? "As a founding member, your first 2 months of Premium are free — they start the day your access begins at launch, not today."
                : "You'll get standard access when Cairn launches; the 50 founding-member places were already taken."}
            </>
          ) : (
            "We'll email you when your access is ready."
          )}
        </Confirmed>
      </div>
    );
  }

  return (
    <div className={centered ? "mx-auto max-w-[520px]" : ""}>
      <form action={submit} noValidate>
        <label htmlFor={`wl-email${centered ? "-2" : ""}`} className="sr-only">
          Email address
        </label>
        <div className={`flex flex-col gap-2.5 sm:flex-row ${centered ? "sm:justify-center" : ""}`}>
          <input
            id={`wl-email${centered ? "-2" : ""}`}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={state.status === "error" ? "wl-error" : undefined}
            className="w-full rounded-panel border border-line bg-canvas px-3.5 py-3 text-lead text-primary transition-colors duration-base ease-standard outline-none placeholder:text-dim focus:border-accent sm:max-w-[320px]"
          />
          <SubmitButton centered={centered} />
        </div>
      </form>

      {state.status === "error" && (
        <p
          id="wl-error"
          className="mt-2.5 rounded-panel border border-negative/40 bg-negative/8 px-3 py-2.5 text-body text-negative"
        >
          {state.message}
        </p>
      )}

      <p className={`mt-3 text-caption leading-[1.6] text-dim text-pretty ${centered ? "" : "max-w-[420px]"}`}>
        No spam, no newsletter — one confirmation email now and one launch email later. Email address
        only.{" "}
        <Link href="/privacy" className="text-muted underline underline-offset-2 hover:text-accent">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
