"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/auth/field";
import { AuthError, AuthFooter, AuthHeader } from "@/components/auth/auth-chrome";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) setError(err.message);
        setReady(true);
      });
    } else {
      setReady(true);
    }
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
    else router.push("/login");
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
          disabled={!ready || pending}
          className="mt-5 w-full rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark py-2.75 text-[13.5px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)] disabled:opacity-60"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>

      <AuthFooter />
    </>
  );
}
