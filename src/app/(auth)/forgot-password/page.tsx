"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

export default function ForgotPasswordPage() {
  const [error, formAction] = useActionState(forgotPassword, null);

  return (
    <div className="w-full max-w-[400px] rounded-2xl border border-line bg-panel px-8 py-9">
      <h1 className="mb-1.5 font-serif text-[26px] text-primary">Reset your password</h1>
      <p className="mb-7 text-sm leading-relaxed text-muted">
        Enter the email on your account and we&apos;ll send a link to reset your password.
      </p>

      {error && <p className="mb-4 text-[13px] text-negative">{error}</p>}

      <form action={formAction}>
        <div className="mb-[26px]">
          <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />
        </div>
        <SubmitButton>Send reset link</SubmitButton>
      </form>

      <p className="mt-[22px] text-center text-[13.5px] text-muted">
        <Link href="/login" className="font-semibold text-accent">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
