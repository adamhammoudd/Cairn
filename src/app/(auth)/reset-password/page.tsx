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
    <div>
      <h1>Set a new password</h1>
      <p>Choose a new password for your account.</p>

      {error && <p>{error}</p>}

      <form onSubmit={handleSubmit}>
        <Field id="password" name="password" type="password" label="New password" placeholder="••••••••" required minLength={8} />
        <div>
          <Field id="confirm" name="confirm" type="password" label="Confirm password" placeholder="••••••••" required minLength={8} />
        </div>
        <button
          type="submit"
          disabled={!ready || pending}

 >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
