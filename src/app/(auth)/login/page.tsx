"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

function LoginMessage() {
  const message = useSearchParams().get("message");

  if (message === "check-your-email") {
    return <p>Check your email to confirm your account.</p>;
  }
  if (message === "check-your-email-for-reset-link") {
    return <p>Check your email for a password reset link.</p>;
  }
  return null;
}

export default function LoginPage() {
  const [error, formAction] = useActionState(signIn, null);

  return (
    <>
      <div>
        <h1>Welcome back</h1>
        <p>Sign in to your portfolio dashboard.</p>

        <Suspense fallback={null}>
          <LoginMessage />
        </Suspense>
        {error && <p>{error}</p>}

        <form action={formAction}>
          <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />
          <div>
            <label htmlFor="password">
              Password
            </label>
            <Link href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required

 />
          <SubmitButton>Sign in</SubmitButton>
        </form>

        <p>
          Don&apos;t have an account?{" "}
          <Link href="/signup">
            Sign up
          </Link>
        </p>
      </div>
      <p>
        Cairn is informational only — not a broker and not investment advice.{" "}
        <Link href="/terms">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy">
          Privacy
        </Link>
      </p>
    </>
  );
}
