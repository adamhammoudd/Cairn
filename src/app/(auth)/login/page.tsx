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
    return <p className="mb-4 text-[13px] text-accent">Check your email to confirm your account.</p>;
  }
  if (message === "check-your-email-for-reset-link") {
    return <p className="mb-4 text-[13px] text-accent">Check your email for a password reset link.</p>;
  }
  return null;
}

export default function LoginPage() {
  const [error, formAction] = useActionState(signIn, null);

  return (
    <>
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-panel px-8 py-9">
        <h1 className="mb-1.5 font-serif text-[26px] text-primary">Welcome back</h1>
        <p className="mb-7 text-sm text-muted">Sign in to your portfolio dashboard.</p>

        <Suspense fallback={null}>
          <LoginMessage />
        </Suspense>
        {error && <p className="mb-4 text-[13px] text-negative">{error}</p>}

        <form action={formAction}>
          <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-[13px] text-muted">
              Password
            </label>
            <Link href="/forgot-password" className="text-[12.5px] text-accent">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            className="mb-[26px] w-full rounded-lg border border-line bg-active px-3.5 py-3 text-sm text-primary outline-none"
          />
          <SubmitButton>Sign in</SubmitButton>
        </form>

        <p className="mt-[22px] text-center text-[13.5px] text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-accent">
            Sign up
          </Link>
        </p>
      </div>
      <p className="mt-7 max-w-[400px] text-center text-xs leading-relaxed text-dim">
        Cairn is informational only — not a broker and not investment advice.{" "}
        <Link href="/terms" className="text-accent">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="text-accent">
          Privacy
        </Link>
      </p>
    </>
  );
}
