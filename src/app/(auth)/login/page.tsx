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
    return <Notice>Check your email to confirm your account.</Notice>;
  }
  if (message === "check-your-email-for-reset-link") {
    return <Notice>Check your email for a password reset link.</Notice>;
  }
  return null;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded-[10px] border border-accent/40 bg-accent/8 px-3 py-2.5 text-[12.5px] text-accent">
      {children}
    </p>
  );
}

export default function LoginPage() {
  const [error, formAction] = useActionState(signIn, null);

  return (
    <>
      <div className="mb-6">
        <div className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">Account</div>
        <h1 className="mt-2 font-serif text-[28px] leading-[1.15] font-normal text-primary">Welcome back</h1>
        <p className="mt-2 text-[13px] text-muted text-pretty">Sign in to your portfolio dashboard.</p>
      </div>

      <Suspense fallback={null}>
        <LoginMessage />
      </Suspense>
      {error && (
        <p className="mb-4 rounded-[10px] border border-negative/40 bg-negative/8 px-3 py-2.5 text-[12.5px] text-negative">
          {error}
        </p>
      )}

      <form action={formAction}>
        <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />

        <div className="mb-3.5">
          <div className="mb-1.75 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-[11.5px] text-muted transition-colors duration-base ease-standard hover:text-accent"
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
            className="w-full rounded-[10px] border border-line bg-[#0B0B0B] px-3 py-2.5 text-[13px] text-primary transition-colors duration-base ease-standard outline-none placeholder:text-dim focus:border-accent"
          />
        </div>

        <div className="mt-5">
          <SubmitButton>Sign in</SubmitButton>
        </div>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-accent transition-colors duration-base ease-standard hover:text-accent-light">
          Sign up
        </Link>
      </p>

      <p className="mt-6 border-t border-line pt-4 text-center text-[11px] leading-[1.6] text-dim text-pretty">
        Cairn is informational only — not a broker and not investment advice.{" "}
        <Link href="/terms" className="text-muted hover:text-primary">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="text-muted hover:text-primary">
          Privacy
        </Link>
      </p>
    </>
  );
}
