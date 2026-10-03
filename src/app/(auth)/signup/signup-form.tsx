"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { AuthError, AuthHeader } from "@/components/auth/auth-chrome";
import { CAPTCHA_ENABLED, Captcha } from "@/components/auth/captcha";
import { TEXT_LINK } from "@/components/front-door/styles";
import { NAME_REQUIRED, isNameError, validateDisplayName } from "@/lib/display-name";

// `invitedEmail` set: a personal invite. The address is shown and locked - the
// invite only works for it - and the form is password + consent and nothing
// else. `invitedEmail` null: a shared invite code, the open form.
export function SignupForm({
  invite,
  invitedEmail,
  betaUntil = null,
}: {
  invite: string;
  invitedEmail: string | null;
  /** "31 December 2026" while BETA_PREMIUM_UNTIL is on, else null. */
  betaUntil?: string | null;
}) {
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
  // The same rules run on the server (signUp); checking here too just saves
  // the round trip and puts the message next to the field.
  const [nameError, setNameError] = useState<string | null>(null);
  const shownNameError = nameError ?? (isNameError(error) ? error : null);

  return (
    <>
      <AuthHeader
        eyebrow="You're invited"
        title="Create your Cairn account."
        blurb={personal ? "Choose a password to create your account." : "Use the email you want to sign in with."}
      />

      {error && !isNameError(error) && <AuthError>{error}</AuthError>}

      <form
        action={formAction}
        onSubmit={(e) => {
          const result = validateDisplayName(name);
          if (result.ok) return;
          e.preventDefault();
          setNameError(result.error);
          document.getElementById("name")?.focus();
        }}
      >
        <input type="hidden" name="invite" value={invite} />
        <Field
          id="name"
          name="name"
          type="text"
          label={NAME_REQUIRED ? "Your name" : "Your name (optional)"}
          placeholder="e.g. Alex Martin"
          autoComplete="name"
          autoCapitalize="words"
          spellCheck={false}
          required={NAME_REQUIRED}
          value={name}
          error={shownNameError}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
        />
        {personal ? (
          <>
            <Field
              id="email"
              name="email"
              type="email"
              label="Email"
              value={invitedEmail}
              readOnly
              aria-readonly="true"
              aria-describedby="email-locked"
              autoComplete="username"
            />
            {/* Lets a password manager pair the new password with the address. */}
            <input type="text" name="username" value={invitedEmail} autoComplete="username" readOnly hidden />
            <p id="email-locked" className="-mt-2 mb-4 text-caption text-muted">
              Your invite is for this address.
            </p>
          </>
        ) : (
          <>
            <Field
              id="email"
              name="email"
              type="email"
              label="Email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          autoComplete="new-password"
        />

        {/* The whole row is the label, so the tap target is the full 44px row,
            not a 16px box. */}
        <div className="mt-2 flex min-h-11 items-start gap-3 py-2">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-accent"
          />
          <label htmlFor="consent" className="text-lead leading-relaxed text-muted">
            I am 18 or older and agree to the{" "}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
              Privacy Policy
            </Link>
            .
          </label>
        </div>

        <Captcha onTokenChange={(token) => setCaptchaDone(!CAPTCHA_ENABLED || token !== "")} />

        <div className="mt-5">
          <SubmitButton frontDoor disabled={!agreed || !captchaDone}>
            Create account
          </SubmitButton>
        </div>
      </form>

      <p className="mt-5 text-caption leading-relaxed text-muted text-pretty">
        {betaUntil ? `Beta members get full Premium until ${betaUntil}. ` : "Free to start - no card required. "}
        Cairn explains markets and never tells you to buy or sell.
      </p>

      {!personal && (
        <p className="mt-4 text-center text-lead text-muted">
          Already have an account?{" "}
          <Link href="/login" className={`tap ${TEXT_LINK}`}>
            Sign in
          </Link>
        </p>
      )}
    </>
  );
}
