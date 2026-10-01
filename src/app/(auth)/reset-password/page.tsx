"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/auth/field";
import { AuthError, AuthHeader } from "@/components/auth/auth-chrome";
import { BUTTON_PRIMARY } from "@/components/front-door/styles";

// checking  - exchanging the link's code for a session
// ready     - a valid session is established; show the new-password form
// invalid   - no code, or the code was expired / already used. Show a "request
//             a new link" panel instead of a form that will only fail on submit.
type LinkStatus = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<LinkStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      // Deferred a tick rather than set synchronously in the effect body: a
      // synchronous setState here cascades an extra render on mount, which is
      // what react-hooks/set-state-in-effect flags.
      const timer = setTimeout(() => setStatus("invalid"), 0);
      return () => clearTimeout(timer);
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
      setStatus(err ? "invalid" : "ready");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (err) setError(err.message);
    // updateUser succeeds only inside the recovery session, so the user is
    // already signed in here - send them into the app, not to a login form.
    else router.push("/");
  }

  if (status === "invalid") {
    return (
      <>
        <AuthHeader
          eyebrow="Account"
          title="This reset link has expired"
          blurb="Password reset links can only be used once and expire after a short while. Request a fresh one and we'll email it to you."
        />
        <Link
          href="/forgot-password"
          className={`${BUTTON_PRIMARY} mt-5 w-full`}
        >
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeader eyebrow="Account" title="Set a new password" blurb="Choose a new password for your account." />

      {error && <AuthError>{error}</AuthError>}

      <form onSubmit={handleSubmit}>
        <Field
          id="password"
          name="password"
          type="password"
          label="New password"
          placeholder="••••••••"
          required
          minLength={8}
        />
        <Field
          id="confirm"
          name="confirm"
          type="password"
          label="Confirm password"
          placeholder="••••••••"
          required
          minLength={8}
        />
        <button
          type="submit"
          disabled={status !== "ready" || pending}
          className={`${BUTTON_PRIMARY} mt-5 w-full`}
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}
