"use client";

import { Suspense, useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { INPUT, TEXT_LINK } from "@/components/front-door/styles";
import { SubmitButton } from "@/components/auth/submit-button";
import { AuthError, AuthHeader } from "@/components/auth/auth-chrome";
import { CAPTCHA_ENABLED, Captcha } from "@/components/auth/captcha";

function LoginMessage() {
  const message = useSearchParams().get("message");

  if (message === "check-your-email") {
    return <Notice>Check your email to confirm your account.</Notice>;
  }
  if (message === "account-created") {
    return <Notice>Your account is ready. Sign in to continue.</Notice>;
  }
  if (message === "check-your-email-for-reset-link") {
    return <Notice>Check your email for a password reset link.</Notice>;
  }
  return null;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mb-4 rounded-panel border border-line bg-panel px-3 py-2.5 text-body text-primary">
      {children}
    </p>
  );
}

export default function LoginPage() {
  const [error, formAction] = useActionState(signIn, null);
  // Controlled so a failed sign-in keeps the email in the box - retyping it on
  // every wrong-password attempt is the pattern new-watchlist-form.tsx already
  // avoids. Password is deliberately left uncontrolled: never hold it in React
  // state, and re-entering it after a failure is expected anyway.
  const [email, setEmail] = useState("");
  const [captchaDone, setCaptchaDone] = useState(!CAPTCHA_ENABLED);

  return (
    <>
      <AuthHeader eyebrow="Account" title="Welcome back" blurb="Sign in to your portfolio dashboard." />

      <Suspense fallback={null}>
        <LoginMessage />
      </Suspense>
      {error && <AuthError>{error}</AuthError>}

      <form action={formAction}>
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

        <div className="mb-4">
          <div className="-mt-3 mb-0.5 flex items-center justify-between gap-3">
            <label htmlFor="password" className="font-mono text-eyebrow text-dim uppercase">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="tap inline-flex min-h-11 items-center text-caption text-muted transition-colors duration-base ease-standard hover:text-primary"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className={INPUT}
          />
        </div>

        <Captcha onTokenChange={(token) => setCaptchaDone(!CAPTCHA_ENABLED || token !== "")} />

        <div className="mt-5">
          <SubmitButton frontDoor disabled={!captchaDone}>Sign in</SubmitButton>
        </div>
      </form>

      <p className="mt-5 text-center text-lead text-muted">
        Don&apos;t have an account yet?{" "}
        {/* Sign-up is closed until launch; new people come in through the waitlist. */}
        <Link href="/waitlist" className={`tap ${TEXT_LINK}`}>
          Join the waitlist
        </Link>
      </p>
    </>
  );
}
