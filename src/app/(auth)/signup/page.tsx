"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { AuthError, AuthFooter, AuthHeader } from "@/components/auth/auth-chrome";
import { CAPTCHA_ENABLED, Captcha } from "@/components/auth/captcha";

// Beta sign-up is invite-only: the invite code from the link (/signup?invite=)
// travels with the form so the server action can check it again.
function InviteField() {
  const invite = useSearchParams().get("invite") ?? "";
  return <input type="hidden" name="invite" value={invite} />;
}

export default function SignupPage() {
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

  return (
    <>
      <AuthHeader eyebrow="Account" title="Create your account" blurb="Free to start - no card required." />

      {error && <AuthError>{error}</AuthError>}

      <form action={formAction}>
        <Suspense fallback={null}>
          <InviteField />
        </Suspense>
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
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          required
          minLength={8}
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

      <p className="mt-5 text-center text-body text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent transition-colors duration-base ease-standard hover:text-accent-light">
          Sign in
        </Link>
      </p>

      <AuthFooter />
    </>
  );
}
