"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/auth/field";

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
    <div className="w-full max-w-[400px] rounded-2xl border border-line bg-panel px-8 py-9">
      <h1 className="mb-1.5 font-serif text-[26px] text-primary">Set a new password</h1>
      <p className="mb-7 text-sm text-muted">Choose a new password for your account.</p>

      {error && <p className="mb-4 text-[13px] text-negative">{error}</p>}

      <form onSubmit={handleSubmit}>
        <Field id="password" name="password" type="password" label="New password" placeholder="••••••••" required minLength={8} />
        <div className="mb-[26px]">
          <Field id="confirm" name="confirm" type="password" label="Confirm password" placeholder="••••••••" required minLength={8} />
        </div>
        <button
          type="submit"
          disabled={!ready || pending}
          className="w-full rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark py-3.5 text-[15px] font-semibold text-canvas disabled:opacity-60"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
