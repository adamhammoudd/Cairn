"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { TEXT_LINK } from "@/components/front-door/styles";
import { SubmitButton } from "@/components/auth/submit-button";
import { AuthError, AuthHeader } from "@/components/auth/auth-chrome";
import { CAPTCHA_ENABLED, Captcha } from "@/components/auth/captcha";

export default function ForgotPasswordPage() {
  const [error, formAction] = useActionState(forgotPassword, null);
  const [captchaDone, setCaptchaDone] = useState(!CAPTCHA_ENABLED);

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
        <Captcha onTokenChange={(token) => setCaptchaDone(!CAPTCHA_ENABLED || token !== "")} />
        <div className="mt-5">
          <SubmitButton frontDoor disabled={!captchaDone}>Send reset link</SubmitButton>
        </div>
      </form>

      <p className="mt-5 text-center text-lead text-muted">
        <Link href="/login" className={`tap ${TEXT_LINK}`}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
