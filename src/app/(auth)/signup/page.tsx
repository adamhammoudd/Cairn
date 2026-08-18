"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

export default function SignupPage() {
  const [error, formAction] = useActionState(signUp, null);

  return (
    <>
      <div>
        <h1>Create your account</h1>
        <p>Free to start — no card required.</p>

        {error && <p>{error}</p>}

        <form action={formAction}>
          <Field id="name" name="name" type="text" label="Name" placeholder="Jordan Reyes" required />
          <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" required />
          <Field
            id="password"
            name="password"
            type="password"
            label="Password"
            placeholder="••••••••"
            required
            minLength={8}
 />
          <div>
            <SubmitButton>Create account</SubmitButton>
          </div>
        </form>

        <p>
          Already have an account?{" "}
          <Link href="/login">
            Sign in
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
