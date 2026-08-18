"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

export default function ForgotPasswordPage() {
  const [error, formAction] = useActionState(forgotPassword, null);

  return (
    <div>
      <h1>Reset your password</h1>
      <p>
        Enter the email on your account and we&apos;ll send a link to reset your password.
      </p>

      {error && <p>{error}</p>}

      <form action={formAction}>
        <div>
          <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />
        </div>
        <SubmitButton>Send reset link</SubmitButton>
      </form>

      <p>
        <Link href="/login">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
