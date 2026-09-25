"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { AuthError, AuthFooter, AuthHeader } from "@/components/auth/auth-chrome";

export default function ForgotPasswordPage() {
  const [error, formAction] = useActionState(forgotPassword, null);

  return (
    <>
      <AuthHeader
        eyebrow="Account"
        title="Reset your password"
        blurb="Enter the email on your account and we will send a link to reset your password."
      />

      {error && <AuthError>{error}</AuthError>}

      <form action={formAction}>
        <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />
        <div className="mt-5">
          <SubmitButton>Send reset link</SubmitButton>
        </div>
      </form>

      <p className="mt-5 text-center text-body text-muted">
        <Link href="/login" className="text-accent transition-colors duration-base ease-standard hover:text-accent-light">
          Back to sign in
        </Link>
      </p>

      <AuthFooter />
    </>
  );
}
