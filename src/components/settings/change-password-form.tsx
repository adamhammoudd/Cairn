"use client";

import { useActionState, useState } from "react";
import { changePassword } from "@/lib/actions/settings";
import { SubmitButton } from "@/components/auth/submit-button";

export function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState(changePassword, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-panel border border-line px-3.5 py-2 text-body text-primary transition-colors duration-fast ease-standard hover:border-line-strong"
      >
        Change password
      </button>
    );
  }

  return (
    <form action={formAction} className="flex max-w-xs flex-col gap-3">
      <input
        type="password"
        name="current_password"
        placeholder="Current password"
        autoComplete="current-password"
        required
        className="w-full rounded-control border border-line bg-active px-3.5 py-2.5 text-lead text-primary outline-none"
      />
      <input
        type="password"
        name="password"
        placeholder="New password"
        autoComplete="new-password"
        required
        minLength={8}
        className="w-full rounded-control border border-line bg-active px-3.5 py-2.5 text-lead text-primary outline-none"
      />
      <div className="flex items-center gap-3">
        <SubmitButton>Update password</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-body text-muted">
          Cancel
        </button>
      </div>
      {result === "saved" && <span className="text-body text-accent">Password updated.</span>}
      {result && result !== "saved" && <span className="text-body text-negative">{result}</span>}
    </form>
  );
}
