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
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-panel px-8 py-9">
        <h1 className="mb-1.5 font-serif text-[26px] text-primary">Create your account</h1>
        <p className="mb-7 text-sm text-muted">Free to start — no card required.</p>

        {error && <p className="mb-4 text-[13px] text-negative">{error}</p>}

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
          <div className="mt-[26px]">
            <SubmitButton>Create account</SubmitButton>
          </div>
        </form>

        <p className="mt-[22px] text-center text-[13.5px] text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </p>
      </div>
      <p className="mt-7 max-w-[400px] text-center text-xs leading-relaxed text-dim">
        Cairn is informational only — not a broker and not investment advice.
      </p>
    </>
  );
}
