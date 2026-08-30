"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { AuthError, AuthFooter, AuthHeader } from "@/components/auth/auth-chrome";

export default function SignupPage() {
  const [error, formAction] = useActionState(signUp, null);
  // Controlled so a rejected sign-up (email already taken, weak password)
  // keeps the name and email the user already typed. Password stays
  // uncontrolled - never in React state.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <>
      <AuthHeader eyebrow="Account" title="Create your account" blurb="Free to start - no card required." />

      {error && <AuthError>{error}</AuthError>}

      <form action={formAction}>
        <Field
          id="name"
          name="name"
          type="text"
          label="Name"
          placeholder="Jordan Reyes"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          required
          minLength={8}
        />
        <div className="mt-5">
          <SubmitButton>Create account</SubmitButton>
        </div>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent transition-colors duration-base ease-standard hover:text-accent-light">
          Sign in
        </Link>
      </p>

      <AuthFooter />
    </>
  );
}
