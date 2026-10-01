"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { AuthError, AuthFooter, AuthHeader } from "@/components/auth/auth-chrome";
import { CAPTCHA_ENABLED, Captcha } from "@/components/auth/captcha";
import { FIELD_LABEL } from "@/components/field-label";

// `invitedEmail` set: a personal invite. The address is shown and locked - the
// invite only works for it, and signUp() rejects any other - and the form is
// password + consent and nothing else.
// `invitedEmail` null: a BETA_INVITE_CODES shared code (manual override), the
// open form exactly as before.
export function SignupForm({ invite, invitedEmail }: { invite: string; invitedEmail: string | null }) {
  const [error, formAction] = useActionState(signUp, null);
  // Controlled so a rejected sign-up (email already taken, weak password)
  // keeps the name and email the user already typed. Password stays
  // uncontrolled - never in React state.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // The submit button stays disabled until this is checked - the consent is
  // gated before the request, not validated after it. signUp() re-checks it
  // server-side and records the consent (src/lib/actions/auth.ts).
  const [agreed, setAgreed] = useState(false);
  const [captchaDone, setCaptchaDone] = useState(!CAPTCHA_ENABLED);
  const personal = invitedEmail !== null;

  return (
    <>
      {personal ? (
        <AuthHeader eyebrow="Beta invite" title="You've been invited" blurb="Choose a password to create your account." />
      ) : (
        <AuthHeader eyebrow="Account" title="Create your account" blurb="Free to start - no card required." />
      )}

      {error && <AuthError>{error}</AuthError>}

      <form action={formAction}>
        <input type="hidden" name="invite" value={invite} />
        {personal ? (
          // Shown, not editable: a plain value rather than a field that looks
          // typeable. The hidden input carries it to signUp(), which rejects
          // any address but the invited one regardless.
          <div className="mb-3.5">
            <span id="email-label" className={FIELD_LABEL}>
              Email
            </span>
            <div
              aria-labelledby="email-label"
              aria-describedby="email-locked"
              className="flex items-center justify-between gap-3 rounded-panel border border-dashed border-line px-3 py-2.5 text-body text-primary"
            >
              <span className="min-w-0 truncate">{invitedEmail}</span>
              <span className="shrink-0 font-mono text-micro text-dim uppercase">Locked</span>
            </div>
            <input type="hidden" name="email" value={invitedEmail} />
            {/* Lets a password manager pair the new password with the address. */}
            <input type="text" name="username" value={invitedEmail} autoComplete="username" readOnly hidden />
          </div>
        ) : (
          <>
            <Field
              id="name"
              name="name"
              type="text"
              label="Name"
              placeholder="Jordan Reyes"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              id="email"
              name="email"
              type="email"
              label="Email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}
        {personal && (
          <p id="email-locked" className="-mt-2 mb-4 text-caption text-dim">
            Your invite is for this address.
          </p>
        )}
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <div className="mt-4 flex items-start gap-2.5">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <label htmlFor="consent" className="text-body leading-[1.5] text-muted">
            I am 18 or older and agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent-light"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent-light"
            >
              Privacy Policy
            </Link>
            .
          </label>
        </div>

        <Captcha onTokenChange={(token) => setCaptchaDone(!CAPTCHA_ENABLED || token !== "")} />

        <div className="mt-5">
          <SubmitButton disabled={!agreed || !captchaDone}>Create account</SubmitButton>
        </div>
      </form>

      {!personal && (
        <p className="mt-5 text-center text-body text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent transition-colors duration-base ease-standard hover:text-accent-light">
            Sign in
          </Link>
        </p>
      )}

      <AuthFooter />
    </>
  );
}
